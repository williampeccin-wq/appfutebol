// INCIDENTE 17/08: toast vermelho "Não consegui salvar no servidor" pipocando
// para os TESTADORES (perfil Jogador) — inclusive logo depois de confirmar
// presença, com a presença DE FATO salva.
//
// Cadeia real:
//   1. loadSplitState compõe o estado CRU do servidor e o guarda como baseline;
//   2. o app roda validateAndRepairState por cima (normaliza telefone com
//      máscara, remove password_hash residual, dedupe, etc.);
//   3. no save seguinte o diff acusa mudança em jogadores que o usuário NUNCA
//      tocou, e o cliente tenta regravar a linha DELES;
//   4. numa sessão de admin passa. Numa sessão de jogador o servidor recusa
//      (trigger harmonia_guard_player_update -> `player_update_not_allowed`,
//      e app_meta/game_state são admin-only), a operação em lote falha e o app
//      culpa a internet — quando a presença, essa sim, tinha sido gravada.
//
// Regra: o cliente NÃO propõe gravação que o servidor sempre recusaria. Jogador
// escreve a própria linha de players e a própria presença; o resto é do admin.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';

const AGORA = '2026-08-17T12:00:00.000Z';
const CLUB = 'e2af269c-20d0-4739-b7db-80ed93165192';

const escritas = [];

function novoServidor() {
  escritas.length = 0;
  return {
    players: [
      { id: 'p_admin', auth_user_id: 'u_admin', is_admin: true, club_id: CLUB,
        data: { id: 'p_admin', name: 'Admin', active: true, phone: '48900000003', position: 'Linha' }, updated_at: AGORA },
      { id: 'p_vl', auth_user_id: 'u_vl', is_admin: false, club_id: CLUB,
        data: { id: 'p_vl', name: 'Jogador', active: true, phone: '48911111111', position: 'Linha' }, updated_at: AGORA },
      // Telefone com máscara: o guard do app normaliza para dígitos e o diff
      // passa a acusar "mudou" nesta linha, que é de OUTRO jogador.
      { id: 'p_out', auth_user_id: 'u_out', is_admin: false, club_id: CLUB,
        data: { id: 'p_out', name: 'Outro', active: true, phone: '(48) 92222-2222', position: 'Linha' }, updated_at: AGORA },
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

// Reproduz o ciclo do app: carrega, passa pelo guard (como replaceState faz) e
// confirma a própria presença.
async function confirmarPresencaComo(uid, playerId) {
  storage.resetClubKeyCache();
  const servidor = novoServidor();
  instalarFetch(servidor);
  sessao(uid);

  const carga = await storage.loadRemoteState();
  assert.equal(carga.ok, true, 'o estado do clube carrega');

  const estado = validateAndRepairState(carga.state).state;
  estado.confirmations = [
    ...(estado.confirmations || []),
    { player_id: playerId, game_key: 'g1', confirmed: true, status: 'confirmed', removed_by_admin: false,
      confirmed_at: AGORA, cancelled_at: null, waitlisted_at: null, waitlist_position: null, timestamp: AGORA },
  ];

  escritas.length = 0;
  const gravacao = await storage.saveRemoteState(estado);
  return { gravacao, escritas: [...escritas] };
}

// ------------------------------------------------------------------- jogador

const comoJogador = await confirmarPresencaComo('u_vl', 'p_vl');

assert.equal(comoJogador.gravacao.ok, true, 'a gravação do jogador não pode falhar');

const presencaDoJogador = comoJogador.escritas.find((e) => e.tabela === 'presence_confirmations');
assert.ok(presencaDoJogador, 'a PRÓPRIA presença tem de ser gravada');
assert.equal(presencaDoJogador.corpo.player_id, 'p_vl');

const playersDeOutros = comoJogador.escritas.filter((e) => e.tabela === 'players' && e.corpo?.id !== 'p_vl');
assert.deepEqual(playersDeOutros, [],
  'jogador NÃO pode tentar gravar a linha de outro jogador — o servidor recusa (player_update_not_allowed) e o app culpa a internet');

const blobsDoClube = comoJogador.escritas.filter((e) => e.tabela === 'app_meta' || e.tabela === 'game_state');
assert.deepEqual(blobsDoClube, [],
  'jogador NÃO pode tentar gravar app_meta/game_state — são admin-only no servidor');

// --------------------------------------------------------------------- admin
// O admin segue curando o dado cru: é dele a permissão para isso.

const comoAdmin = await confirmarPresencaComo('u_admin', 'p_admin');

assert.equal(comoAdmin.gravacao.ok, true, 'a gravação do admin funciona');
assert.ok(
  comoAdmin.escritas.some((e) => e.tabela === 'players' && e.corpo?.id === 'p_out'),
  'o admin continua normalizando a linha dos outros jogadores (auto-cura do dado)'
);

console.log('OK — 7 asserções. Jogador só escreve o que é dele; admin segue curando o resto.');
