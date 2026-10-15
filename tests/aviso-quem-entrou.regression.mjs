// Com time sorteado, quem entra pela fila NÃO vai para o time de quem saiu: fica
// em "Confirmados fora do sorteio" e o admin escala. Saiu um atacante, pode ter
// entrado um zagueiro — a decisão é dele, e ele precisa saber que há decisão.
//
// Desde 15/10/2026 o BANCO promove a fila (trg_presence_promove_fila). O
// aparelho de quem saiu pode não saber quem entrou, então pergunta ao banco
// quem ele promoveu (fetchPromovidosPeloBanco) para mandar o "Você está dentro!".
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';
import { replaceState } from '../appfutebol_run/js/core/state.js';
import { adminRemovePlayerFromGame, cederVagaParaPrimeiroDaFila } from '../appfutebol_run/js/modules/game/game.service.js';

const JOGO = 'game_2099-10-14_2030';
const jogador = (id, name) => ({
  id, name, phone: `5199${String(id.length).padStart(7, '0')}`, position: 'meia', plays_football: true, mens_ok: true,
});
const conf = (id) => ({ game_key: JOGO, player_id: id, confirmed: true, status: 'confirmed' });
const naFila = { game_key: JOGO, player_id: 'feijo', confirmed: false, status: 'waitlist', waitlisted_at: '2099-10-13T10:00:00.000Z' };

function estado({ sorteado }) {
  const jogo = {
    game_key: JOGO, id: JOGO, game_date: '2099-10-14', game_time: '20:30', max_players: 2, open: true,
    sort_result: sorteado ? { id: 's1', team_a: ['caue'], team_b: ['p2'] } : null,
  };
  replaceState({
    players: [jogador('caue', 'Caue'), jogador('p2', 'Dois'), jogador('feijo', 'Guilherme Feijó')],
    game: jogo, games: [jogo], active_game_id: JOGO,
    confirmations: [conf('caue'), conf('p2'), { ...naFila }],
    session: { playerId: 'p2' }, ui: { currentTab: 'weekly_game' },
  });
}

estado({ sorteado: true });
const removido = adminRemovePlayerFromGame('caue');
assert.equal(removido.promotedPlayerId, 'feijo');
assert.match(removido.message, /Guilherme Feijó entrou pela fila e está fora do sorteio/, 'com sorteio, o admin sabe quem entrou e que precisa escalar');

estado({ sorteado: false });
assert.equal(adminRemovePlayerFromGame('caue').message, 'Jogador removido. Primeiro da fila entrou automaticamente.',
  'sem sorteio, não há escalação a revisar');

estado({ sorteado: true });
assert.equal(cederVagaParaPrimeiroDaFila('caue').foraDoSorteio, true, 'ceder a vaga com sorteio também avisa');
estado({ sorteado: false });
assert.equal(cederVagaParaPrimeiroDaFila('caue').foraDoSorteio, false);

// ------------------------------------------------- quem o banco promoveu

const pedidos = [];
globalThis.window = {
  HARMONIA_SUPABASE: { enabled: true, url: 'https://exemplo-teste.supabase.co', anonKey: 'anon', environment: 'test' },
  location: { hostname: 'teste.local' }, dispatchEvent: () => true, addEventListener: () => {},
};
globalThis.localStorage = {
  _v: { harmonia_auth_session: JSON.stringify({ access_token: 't', user: { id: 'u1' } }) },
  getItem(k) { return this._v[k] ?? null; }, setItem(k, v) { this._v[k] = String(v); }, removeItem(k) { delete this._v[k]; },
};
globalThis.fetch = async (url) => {
  pedidos.push(decodeURIComponent(String(url)));
  return { ok: true, status: 200, json: async () => [{ player_id: 'feijo' }], text: async () => '' };
};

const { fetchPromovidosPeloBanco } = await import('../appfutebol_run/js/services/storage.supabase.js');
const promovidos = await fetchPromovidosPeloBanco(JOGO, '2099-10-14T19:54:00.000Z');
assert.deepEqual(promovidos, ['feijo']);
const pedido = pedidos.at(-1);
for (const filtro of [`game_key=eq.${JOGO}`, 'status=eq.confirmed', 'data->>source=eq.banco_promove_fila', 'updated_at=gte.2099-10-14T19:54:00.000Z']) {
  assert.ok(pedido.includes(filtro), `a consulta filtra ${filtro}`);
}

console.log('ok - o admin sabe quem entrou fora do sorteio, e o app acha quem o banco promoveu');
