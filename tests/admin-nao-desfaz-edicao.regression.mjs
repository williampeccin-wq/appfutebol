// INCIDENTE 18/08: o Vinícius trocou a própria posição (meia -> zagueiro) e no
// dia seguinte ela tinha VOLTADO para "meia" sozinha.
//
// Cadeia real (mesma raiz do incidente 17/08, ver jogador-escrita-restrita):
//   1. loadSplitState guarda como baseline do diff o estado CRU do servidor;
//   2. o estado que vai ser gravado passou por validateAndRepairState (telefone
//      com máscara -> dígitos, remove password_hash residual, dedupe);
//   3. buildGranularOperations compara os dois e acusa mudança FANTASMA em
//      linhas que o usuário NUNCA editou, propondo regravá-las;
//   4. o v1.171.0 barrou isso só na sessão do JOGADOR (writerScope). Na sessão
//      de ADMIN a linha do outro jogador continua sendo regravada — com a CÓPIA
//      LOCAL, que pode estar mais velha que o servidor. Não há trava de
//      concorrência para `players` (o rebase cobre só game_state/app_meta) e a
//      linha é gravada como blob inteiro: quem grava por último apaga a edição
//      do outro.
//
// Só morde linha que tenha algum artefato de reparo (telefone com máscara,
// password_hash residual, duplicata) — por isso pegou o Vinícius e não todos.
//
// Regra: artefato de reparo NÃO é edição do usuário. O baseline do diff tem de
// passar pelo MESMO reparo antes de comparar. O admin continua podendo editar
// os outros jogadores de verdade — o que ele não pode é regravar quem não tocou.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';

const AGORA = '2026-08-18T12:00:00.000Z';
const CLUB = 'e2af269c-20d0-4739-b7db-80ed93165192';

const escritas = [];

function novoServidor() {
  escritas.length = 0;
  return {
    players: [
      { id: 'p_admin', auth_user_id: 'u_admin', is_admin: true, club_id: CLUB,
        data: { id: 'p_admin', name: 'Admin', active: true, phone: '48900000003', position: 'Linha' }, updated_at: AGORA },
      // Telefone COM MÁSCARA: é o artefato de reparo que faz o diff acusar
      // mudança fantasma nesta linha, que o admin nunca tocou.
      { id: 'p_vini', auth_user_id: 'u_vini', is_admin: false, club_id: CLUB,
        data: { id: 'p_vini', name: 'Vinícius', active: true, phone: '(48) 92222-2222', position: 'meia' }, updated_at: AGORA },
    ],
    game: { key: CLUB, data: { game_key: 'g1', game_date: '2026-10-18', status: 'aberto', max_players: 10 }, updated_at: AGORA },
    meta: { key: CLUB, data: { profile: { schema_version: 1 }, games: [{ game_key: 'g1', game_date: '2026-10-18', status: 'aberto', max_players: 10 }], active_game_id: 'g1', carne: [], notifications: [] }, updated_at: AGORA },
    presence: [],
  };
}

function instalarFetch(servidor) {
  globalThis.fetch = async (url, options = {}) => {
    const alvo = String(url);
    const metodo = String(options.method || 'GET').toUpperCase();
    const json = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => '' });

    if (metodo === 'GET') {
      if (alvo.includes('select=club_id')) return json([{ club_id: CLUB }]);
      if (alvo.includes('/players')) return json(servidor.players);
      if (alvo.includes('/presence_confirmations')) return json(servidor.presence);
      if (alvo.includes('/game_state')) return json([servidor.game]);
      if (alvo.includes('/app_meta')) return json([servidor.meta]);
      return json([]);
    }

    const tabela = (alvo.match(/\/rest\/v1\/([^?]+)/) || [])[1] || '';
    let corpo = null;
    try { corpo = JSON.parse(options.body || 'null'); } catch (_) {}
    escritas.push({ metodo, tabela, corpo });
    return json(corpo ? [corpo] : []);
  };
}

function sessao(uid) {
  globalThis.localStorage._v.harmonia_auth_session = JSON.stringify({ access_token: 't', user: { id: uid } });
}

globalThis.window = {
  HARMONIA_SUPABASE: { enabled: true, url: 'https://exemplo-teste.supabase.co', anonKey: 'anon', environment: 'test' },
  location: { hostname: 'teste.local' },
  dispatchEvent: () => true,
  addEventListener: () => {},
};
globalThis.localStorage = {
  _v: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; },
};

const storage = await import('../appfutebol_run/js/services/storage.supabase.js');
const { validateAndRepairState } = await import('../appfutebol_run/js/domain/state.guard.js');

// Ciclo real do app na sessão do admin: carrega, passa pelo guard (como o
// replaceState faz), mexe SÓ no que é dele, grava.
async function cicloDoAdmin({ enquantoIssoNoServidor = () => {}, edicaoDoAdmin = () => {} } = {}) {
  storage.resetClubKeyCache();
  const servidor = novoServidor();
  instalarFetch(servidor);
  sessao('u_admin');

  const carga = await storage.loadRemoteState();
  assert.equal(carga.ok, true, 'o estado do clube carrega');

  const estado = validateAndRepairState(carga.state).state;

  // O jogador edita o PRÓPRIO perfil no servidor depois que o admin carregou.
  enquantoIssoNoServidor(servidor);

  edicaoDoAdmin(estado);

  // O admin confirma a própria presença — a ação inocente que dispara o save.
  estado.confirmations = [
    ...(estado.confirmations || []),
    { player_id: 'p_admin', game_key: 'g1', confirmed: true, status: 'confirmed', removed_by_admin: false,
      confirmed_at: AGORA, cancelled_at: null, waitlisted_at: null, waitlist_position: null, timestamp: AGORA },
  ];

  escritas.length = 0;
  const gravacao = await storage.saveRemoteState(estado);
  return { gravacao, escritas: [...escritas] };
}

// ------------------------------------------------- o incidente propriamente

const semTocar = await cicloDoAdmin({
  enquantoIssoNoServidor: (servidor) => {
    const vini = servidor.players.find((p) => p.id === 'p_vini');
    vini.data = { ...vini.data, position: 'zag' };
    vini.updated_at = '2026-08-18T12:30:00.000Z';
  },
});

assert.equal(semTocar.gravacao.ok, true, 'a gravação do admin funciona');

const presencaDoAdmin = semTocar.escritas.find((e) => e.tabela === 'presence_confirmations');
assert.ok(presencaDoAdmin, 'a presença do admin tem de ser gravada');
assert.equal(presencaDoAdmin.corpo.player_id, 'p_admin');

const regravacoesDoVini = semTocar.escritas.filter((e) => e.tabela === 'players' && e.corpo?.id === 'p_vini');
assert.deepEqual(regravacoesDoVini, [],
  'o admin NÃO pode regravar a linha de um jogador que não tocou — a cópia local dele é mais velha que o servidor e desfaz a edição de perfil alheia');

// -------------------------------------- e o admin continua podendo editar

const editando = await cicloDoAdmin({
  edicaoDoAdmin: (estado) => {
    const vini = estado.players.find((p) => p.id === 'p_vini');
    vini.position = 'zag';
  },
});

assert.equal(editando.gravacao.ok, true, 'a gravação do admin funciona');

const edicaoGravada = editando.escritas.find((e) => e.tabela === 'players' && e.corpo?.id === 'p_vini');
assert.ok(edicaoGravada, 'edição REAL do admin na linha de outro jogador continua sendo gravada');
assert.equal(edicaoGravada.corpo.data.position, 'zag', 'e grava o valor que o admin escolheu');

console.log('OK — 7 asserções. Artefato de reparo não conta como edição; edição de verdade conta.');
