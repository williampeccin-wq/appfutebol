// Regressão do INCIDENTE 23/07: um resultado de campeonato já lançado
// desapareceu do banco sem erro, sem aviso e sem rastro.
//
// CAUSA: a trava de concorrência otimista comparava grandezas diferentes. O
// baseline (`lastRemoteUpdatedAt`) era o updated_at mais recente entre QUATRO
// tabelas — players, presence_confirmations, game_state e app_meta — enquanto a
// verificação de frescor lia só DUAS (game_state e app_meta). Bastava uma
// confirmação de presença recente para o baseline ficar mais novo que o valor
// comparado; a subtração dava negativo, a trava nunca disparava, e um cliente
// com estado defasado gravava o blob inteiro por cima, apagando o que outro
// cliente havia lançado.
//
// Com 13 jogadores confirmando presença para o próximo jogo, essa condição era
// o estado NORMAL do sistema — a trava estava efetivamente desligada.
//
// Rodar: node tests/conflito-sobrescrita.regression.mjs

import assert from 'node:assert/strict';

const T = (min) => new Date(Date.UTC(2026, 6, 23, 19, min, 0)).toISOString();

// ---------------------------------------------------------------- servidor falso

function criarServidor() {
  const servidor = {
    players: [
      { id: 'p1', auth_user_id: null, is_admin: true, data: { id: 'p1', name: 'Admin', active: true }, updated_at: T(0) },
    ],
    presence: [
      // A confirmação é a linha MAIS RECENTE do banco — o gatilho do bug.
      { game_key: 'game_2026-07-29_2030', player_id: 'p1', status: 'confirmed', data: {}, updated_at: T(50) },
    ],
    game: { key: 'default', data: { game_key: 'game_2026-07-29_2030', game_date: '2026-07-29' }, updated_at: T(5) },
    meta: {
      key: 'default',
      data: {
        championship: { active: { id: 'inverno-2026', results: [{ id: 'r1', date: '2026-07-15' }] } },
        games: [{ game_key: 'game_2026-07-29_2030', game_date: '2026-07-29' }],
        carne: [{ type: 'carne_rotation' }],
        settings: { mens_amount: 50, mens_beneficiary: 'Harmonia' },
      },
      updated_at: T(10),
    },
    escritas: [],
  };
  return servidor;
}

function instalarFetch(servidor) {
  globalThis.fetch = async (url, options = {}) => {
    const alvo = String(url);
    const metodo = String(options.method || 'GET').toUpperCase();
    const json = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => '' });

    if (metodo === 'GET') {
      if (alvo.includes('/players')) {
        return json(servidor.players.map((r) => ({ ...r, data: r.data })));
      }
      if (alvo.includes('/presence_confirmations')) {
        return json(servidor.presence);
      }
      if (alvo.includes('/game_state')) return json([servidor.game]);
      if (alvo.includes('/app_meta')) return json([servidor.meta]);
    }

    if (metodo === 'POST') {
      const corpo = JSON.parse(options.body || '{}');
      if (alvo.includes('/app_meta')) {
        servidor.meta = { key: 'default', data: corpo.data, updated_at: corpo.updated_at };
        servidor.escritas.push('app_meta');
        return json([servidor.meta]);
      }
      if (alvo.includes('/game_state')) {
        servidor.game = { key: 'default', data: corpo.data, updated_at: corpo.updated_at };
        servidor.escritas.push('game_state');
        return json([servidor.game]);
      }
      if (alvo.includes('/presence_confirmations')) return json([corpo]);
      if (alvo.includes('/players')) return json([corpo]);
    }

    return json([]);
  };
}

function instalarAmbiente() {
  globalThis.window = {
    HARMONIA_SUPABASE: {
      enabled: true,
      url: 'https://exemplo-teste.supabase.co',
      anonKey: 'anon-teste',
      environment: 'test',
    },
    location: { hostname: 'teste.local' },
    dispatchEvent: () => true,
    addEventListener: () => {},
  };
  globalThis.localStorage = {
    _v: { harmonia_auth_session: JSON.stringify({ access_token: 'token-teste', user: { id: 'u1' } }) },
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null; },
    setItem(k, v) { this._v[k] = String(v); },
    removeItem(k) { delete this._v[k]; },
  };
}

// ---------------------------------------------------------------- cenário

const servidor = criarServidor();
instalarAmbiente();
instalarFetch(servidor);

const storage = await import('../appfutebol_run/js/services/storage.supabase.js');

// 1) O admin abre o app e carrega o estado.
const carga = await storage.loadRemoteState();
assert.equal(carga.ok, true, 'o estado remoto deveria carregar');

// O baseline geral é a presença (T50), MUITO mais nova que o app_meta (T10).
// É essa assimetria que desligava a trava.
assert.equal(storage.getLastRemoteUpdatedAt(), T(50), 'baseline geral deve vir da presença (a linha mais recente)');

// 2) Enquanto isso, OUTRO cliente (o cron auto-open, o celular, outra aba)
//    grava no app_meta: acrescenta o jogo de 05/08.
servidor.meta = {
  key: 'default',
  data: {
    ...servidor.meta.data,
    games: [...servidor.meta.data.games, { game_key: 'game_2026-08-05_2030', game_date: '2026-08-05' }],
  },
  updated_at: T(40),   // mais novo que o app_meta que lemos (T10), mais VELHO que a presença (T50)
};

// 3) O admin lança um resultado novo. O estado que ele tem em mãos é o da carga
//    original — ou seja, ainda não conhece o jogo de 05/08.
const estadoLocal = carga.state;
estadoLocal.championship.active.results = [
  ...estadoLocal.championship.active.results,
  { id: 'r2', date: '2026-07-22' },
];

const gravacao = await storage.saveRemoteState(estadoLocal);

// ---------------------------------------------------------------- asserções

assert.equal(gravacao.ok, true, 'a gravação do admin deveria ter sido concluída');

const resultadosFinais = servidor.meta.data.championship.active.results.map((r) => r.date).sort();
const jogosFinais = servidor.meta.data.games.map((g) => g.game_date).sort();

// A alteração do admin chegou ao servidor.
assert.deepEqual(
  resultadosFinais,
  ['2026-07-15', '2026-07-22'],
  'o resultado lançado pelo admin tem de estar no servidor — e o anterior não pode sumir',
);

// E a alteração do OUTRO cliente sobreviveu. Antes da correção, o save do admin
// carimbava seu snapshot inteiro por cima e o jogo de 05/08 desaparecia.
assert.deepEqual(
  jogosFinais,
  ['2026-07-29', '2026-08-05'],
  'o jogo criado pelo outro cliente não pode ser apagado pela gravação do admin',
);

// Os campos que o admin NÃO tocou seguem intactos.
assert.equal(servidor.meta.data.settings.mens_amount, 50, 'settings não deve ser afetado');
assert.deepEqual(servidor.meta.data.carne, [{ type: 'carne_rotation' }], 'o rodízio da carnê não deve ser afetado');

// ---------------------------------------------------------------- cenário 2
//
// A direção EXATA do incidente: o resultado do campeonato está no servidor e um
// cliente defasado — que nem mexeu no campeonato — grava por cima e o apaga.
// Foi assim que o 15/07 sumiu: às 19:12 alguém gravou o app_meta com um
// championship velho.

const servidor2 = criarServidor();
instalarFetch(servidor2);

// O cliente defasado carrega o estado (ainda sem o resultado de 22/07).
const carga2 = await storage.loadRemoteState();
assert.equal(carga2.ok, true, 'o estado remoto deveria carregar');

// OUTRO admin lança o resultado de 22/07. O app_meta avança.
servidor2.meta = {
  key: 'default',
  data: {
    ...servidor2.meta.data,
    championship: { active: { id: 'inverno-2026', results: [{ id: 'r1', date: '2026-07-15' }, { id: 'r2', date: '2026-07-22' }] } },
  },
  updated_at: T(40),
};

// O cliente defasado faz algo que NÃO tem nada a ver com campeonato — só marca
// outra data de vencimento — e salva.
const estadoDefasado = carga2.state;
estadoDefasado.settings.mens_expire_date = '2026-08-10';

const gravacao2 = await storage.saveRemoteState(estadoDefasado);
assert.equal(gravacao2.ok, true, 'a gravação do cliente defasado deveria ser concluída');

assert.deepEqual(
  servidor2.meta.data.championship.active.results.map((r) => r.date).sort(),
  ['2026-07-15', '2026-07-22'],
  'um cliente que NÃO mexeu no campeonato jamais pode apagar um resultado lançado por outro',
);

assert.equal(
  servidor2.meta.data.settings.mens_expire_date,
  '2026-08-10',
  'a alteração que o cliente realmente fez precisa ter sido gravada',
);

// ---------------------------------------------------------------- cenário 3
//
// O caso comum (ninguém gravou junto) tem de continuar simples e direto: grava
// sem rebase, sem releitura extra, sem conflito. Uma correção de concorrência
// que transforma toda gravação normal em rebase seria um custo escondido.

const servidor3 = criarServidor();
instalarFetch(servidor3);

const carga3 = await storage.loadRemoteState();
assert.equal(carga3.ok, true, 'o estado remoto deveria carregar');

const estado3 = carga3.state;
estado3.settings.mens_amount = 60;

servidor3.escritas.length = 0;
const gravacao3 = await storage.saveRemoteState(estado3);

assert.equal(gravacao3.ok, true, 'gravação sem concorrência deveria funcionar');
assert.equal(gravacao3.conflict, false, 'gravação sem concorrência não pode reportar conflito');
assert.equal(gravacao3.rebased, false, 'gravação sem concorrência não deve passar por rebase');
assert.equal(servidor3.meta.data.settings.mens_amount, 60, 'o valor alterado precisa chegar ao servidor');
assert.deepEqual(
  servidor3.meta.data.championship.active.results.map((r) => r.date),
  ['2026-07-15'],
  'o restante do estado segue intacto na gravação normal',
);

console.log('OK — 11 asserções em 3 cenários. Gravação concorrente preserva os dois lados; nada é sobrescrito em silêncio.');
