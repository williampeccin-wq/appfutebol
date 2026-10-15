// INCIDENTE 14/10/2026 (Harmonia): o jogo das 20h30 seguiu sendo o jogo ativo
// madrugada adentro. À 00:28 o Bignoti, escalado, tocou em "Cancelar presença"
// e confirmou de novo segundos depois: o app mandou "Time desfalcado" para os
// admins com o jogo já jogado, e o cancelamento por pouco não o tira da votação
// de desempenho, que estava aberta.
//
// Regra: depois do horário marcado, a presença não muda pelo botão do jogador.
// O admin segue podendo ajustar pelas ações dele.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';
import { jogoJaComecou } from '../appfutebol_run/js/domain/rules.engine.js';
import { replaceState, getState } from '../appfutebol_run/js/core/state.js';
import { toggleConfirmation } from '../appfutebol_run/js/modules/game/game.service.js';

// ------------------------------------------------- o predicado

const jogo = { game_date: '2026-10-14', game_time: '20:30' };
const as = (hhmm, dia = '2026-10-14') => new Date(`${dia}T${hhmm}:00`).getTime(); // hora local, como o app

assert.equal(jogoJaComecou(jogo, as('20:29')), false, 'um minuto antes ainda dá para mexer');
assert.equal(jogoJaComecou(jogo, as('20:30')), true, 'no horário marcado, travou');
assert.equal(jogoJaComecou(jogo, as('00:28', '2026-10-15')), true, 'a madrugada seguinte, travada');
assert.equal(jogoJaComecou({ game_date: '2026-10-14' }, as('23:59')), false, 'sem horário, o dia do jogo fica livre');
assert.equal(jogoJaComecou({ game_date: '2026-10-14' }, as('00:00', '2026-10-15')), true, 'e trava na virada');
assert.equal(jogoJaComecou({}, as('12:00')), false, 'sem data não há o que travar');

// ------------------------------------------------- o botão do jogador

const JOGO = 'game_2000-01-01_2030';
const PASSADO = { game_key: JOGO, id: JOGO, game_date: '2000-01-01', game_time: '20:30', max_players: 10, open: true };
const jogador = (n) => ({
  id: `p${n}`, name: `Jogador ${n}`, phone: `5199000${String(n).padStart(4, '0')}`,
  position: 'meia', plays_football: true, mens_ok: true,
});

replaceState({
  players: [jogador(1), jogador(2)],
  game: PASSADO,
  games: [PASSADO],
  active_game_id: JOGO,
  confirmations: [{ game_key: JOGO, player_id: 'p1', confirmed: true, status: 'confirmed' }],
  session: { playerId: 'p1' },
  ui: { currentTab: 'home' },
});

const cancelou = toggleConfirmation('p1');
assert.equal(cancelou.ok, false, 'depois do jogo, o jogador não cancela');
assert.match(cancelou.message, /já começou/, 'e a tela diz por quê');
assert.equal(getState().confirmations.find((e) => e.player_id === 'p1').confirmed, true, 'a presença dele fica como estava');

assert.equal(toggleConfirmation('p2').ok, false, 'nem confirma de última hora');

// O admin ainda inclui (ex.: quem jogou e esqueceu de confirmar).
const incluiu = toggleConfirmation('p2', { bypassFinance: true, porAdmin: true });
assert.equal(incluiu.ok, true, 'o admin segue podendo ajustar');
assert.equal(getState().confirmations.find((e) => e.player_id === 'p2').confirmed, true);

console.log('ok - depois do horário do jogo, a presença só muda pelo admin');
