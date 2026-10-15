// INCIDENTE 14/10/2026 (Harmonia): jogo de 16 vagas de linha, lotado, com o
// Feijó primeiro da fila. Às 16:56 o admin removeu o Caue do jogo; a remoção
// promoveu o Feijó no aparelho dele e as DUAS gravações saíram no mesmo lote,
// em paralelo:
//   - presença do Caue  -> removed
//   - presença do Feijó -> confirmed
// A trava de lotação do banco (trg_presence_line_capacity, migration
// 20260929190000) avaliou a do Feijó antes de a do Caue estar gravada, contou
// 16/16 e recusou com JOGO_LOTADO. O app devolveu o Feijó para a fila; ele só
// entrou às 17:03, quando o admin abriu a tela para refazer o sorteio.
//
// Regra: num mesmo save, quem LIBERA vaga é gravado antes de quem OCUPA.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';

const AGORA = '2026-10-14T19:56:38.000Z';
const CLUB = 'e2af269c-20d0-4739-b7db-80ed93165192';
const JOGO = 'game_2026-10-14_2030';
const VAGAS = 16;

const jogador = (id, extra = {}) => ({
  id, auth_user_id: `u_${id}`, is_admin: false, club_id: CLUB,
  data: { id, name: id, active: true, phone: `4890000${String(id.length).padStart(4, '0')}`, position: 'Linha' },
  updated_at: AGORA, ...extra,
});
const presenca = (playerId, status, extra = {}) => ({
  game_key: JOGO, player_id: playerId, status, club_id: CLUB,
  confirmed_at: status === 'confirmed' ? AGORA : null, cancelled_at: null, removed_by_admin: false,
  data: { player_id: playerId, game_key: JOGO, status, confirmed: status === 'confirmed', ...extra },
  updated_at: AGORA,
});

const dentro = Array.from({ length: VAGAS - 1 }, (_, i) => `p${i + 1}`);
const jogo = { game_key: JOGO, game_date: '2026-10-14', status: 'aberto', open: true, max_players: VAGAS };

const servidor = {
  players: [
    jogador('p1', { is_admin: true }),
    ...dentro.slice(1).map((id) => jogador(id)),
    jogador('caue'),
    jogador('feijo'),
  ],
  game: { key: CLUB, data: jogo, updated_at: AGORA },
  meta: { key: CLUB, data: { profile: { schema_version: 1 }, games: [jogo], active_game_id: JOGO, carne: [], notifications: [] }, updated_at: AGORA },
  presence: [
    ...dentro.map((id) => presenca(id, 'confirmed')),
    presenca('caue', 'confirmed'),
    presenca('feijo', 'waitlist', { waitlisted_at: '2026-10-14T12:00:00.000Z', waitlist_position: 1 }),
  ],
};

const linhaConfirmada = (exceto) => servidor.presence
  .filter((row) => row.status === 'confirmed' && row.player_id !== exceto).length;

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const corpo = JSON.parse(options.body || 'null');
  if (!alvo.includes('/presence_confirmations') || !corpo) return json(corpo ? [corpo] : []);

  // Quem libera vaga demora um pouco mais para "commitar" que quem ocupa: é o
  // pior caso do paralelo, e foi o que aconteceu em produção.
  if (corpo.status !== 'confirmed') await espera(20);

  // Espelho do trigger trg_presence_line_capacity.
  const anterior = servidor.presence.find((row) => row.player_id === corpo.player_id);
  if (corpo.status === 'confirmed' && anterior?.status !== 'confirmed' && linhaConfirmada(corpo.player_id) >= VAGAS) {
    return {
      ok: false, status: 400, json: async () => null,
      text: async () => JSON.stringify({ message: `JOGO_LOTADO: ${VAGAS} vaga(s) de linha ocupada(s) de ${VAGAS} no jogo ${JOGO}` }),
    };
  }

  servidor.presence = servidor.presence.filter((row) => row.player_id !== corpo.player_id).concat([corpo]);
  return json([corpo]);
};

globalThis.window = {
  HARMONIA_SUPABASE: { enabled: true, url: 'https://exemplo-teste.supabase.co', anonKey: 'anon', environment: 'test' },
  location: { hostname: 'teste.local' },
  dispatchEvent: () => true,
  addEventListener: () => {},
};
globalThis.localStorage = {
  _v: { harmonia_auth_session: JSON.stringify({ access_token: 't', user: { id: 'u_p1' } }) },
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; },
};

const storage = await import('../appfutebol_run/js/services/storage.supabase.js');
const { validateAndRepairState } = await import('../appfutebol_run/js/domain/state.guard.js');

storage.resetClubKeyCache?.(); // só existe no multi-tenant
const carga = await storage.loadRemoteState();
assert.equal(carga.ok, true, 'o estado do clube carrega');

// O que adminRemovePlayerFromGame entrega ao save: Caue removido, Feijó promovido.
const estado = validateAndRepairState(carga.state).state;
estado.confirmations = estado.confirmations.map((entry) => {
  if (entry.player_id === 'caue') {
    return { ...entry, confirmed: false, status: 'removed', removed_by_admin: true, confirmed_at: null, timestamp: AGORA };
  }
  if (entry.player_id === 'feijo') {
    return { ...entry, confirmed: true, status: 'confirmed', waitlisted_at: null, waitlist_position: null, confirmed_at: AGORA, timestamp: AGORA };
  }
  return entry;
});

const gravacao = await storage.saveRemoteState(estado);

assert.equal(gravacao.serverMessage ?? null, null, 'o banco não pode recusar a promoção por lotação');
assert.equal(gravacao.ok, true, 'a troca Caue -> Feijó é gravada inteira');
assert.equal(servidor.presence.find((row) => row.player_id === 'caue')?.status, 'removed', 'o Caue sai');
assert.equal(servidor.presence.find((row) => row.player_id === 'feijo')?.status, 'confirmed', 'o Feijó entra na hora');
assert.equal(linhaConfirmada(), VAGAS, 'o jogo segue com 16, nem 15 nem 17');

console.log('OK — 5 asserções. Quem sai é gravado antes de quem entra.');
