// Preferência na fila para quem está em dia (settings.fila_prioriza_em_dia).
//
// De onde veio: em 29/09/2026 o admin do Harmonia tirou um confirmado em atraso
// na mão para pôr quem estava na fila. O clube não quer bloquear nem remover
// inadimplente — quer só que, quando abre uma vaga, ela vá primeiro para quem
// está em dia. É outro eixo dos modos de bloqueio, e por isso é uma chave à
// parte, desligada por padrão.
//
// O que não pode acontecer, e é o que este teste guarda:
//   - a fila que a tela mostra divergir da fila que entra (foi a confusão do
//     incidente: ler "#1" e ver outro entrar);
//   - a preferência valer antes do vencimento, ou pegar quem é isento, ou pegar
//     registro sem o campo `mens_ok` — as três armadilhas que já morderam o
//     bloqueio ("16/16 -> 14/16").
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';
import { cedeVezNaFilaPorMensalidade, filaPrioridadeEmDia } from '../appfutebol_run/js/domain/rules.engine.js';
import { replaceState, getState } from '../appfutebol_run/js/core/state.js';
import { getWaitlistView, toggleConfirmation } from '../appfutebol_run/js/modules/game/game.service.js';

const JOGO = 'game_2026-10-07_2030';
const VENCEU = { game_key: JOGO, id: JOGO, max_players: 4, open: true, mens_expire_date: '2026-09-10' };
const A_VENCER = { ...VENCEU, mens_expire_date: '2099-01-01' };

const jogador = (n, extra = {}) => ({
  id: `p${n}`,
  name: `Jogador ${n}`,
  phone: `5199000${String(n).padStart(4, '0')}`,
  position: 'meia',
  plays_football: true,
  mens_ok: true,
  ...extra,
});

const naFila = (id, quando) => ({
  game_key: JOGO, player_id: id, confirmed: false, status: 'waitlist', waitlisted_at: quando,
});
const confirmado = (id) => ({ game_key: JOGO, player_id: id, confirmed: true, status: 'confirmed' });

// ------------------------------------------------- o predicado

const emDia = jogador(1);
const atrasado = jogador(2, { mens_ok: false });
const semCampo = jogador(3, { mens_ok: undefined });
const isento = jogador(4, { mens_ok: false, role: 'carne' });
const LIGADA = { fila_prioriza_em_dia: true };

assert.equal(filaPrioridadeEmDia(LIGADA), true, 'a chave liga a regra');
assert.equal(filaPrioridadeEmDia({}), false, 'e vem desligada por padrão');

assert.equal(cedeVezNaFilaPorMensalidade(atrasado, VENCEU, LIGADA), true, 'inadimplente cede a vez');
assert.equal(cedeVezNaFilaPorMensalidade(atrasado, VENCEU, {}), false, 'com a chave desligada, ninguém cede');
assert.equal(cedeVezNaFilaPorMensalidade(atrasado, A_VENCER, LIGADA), false, 'antes do vencimento ninguém está em atraso');
assert.equal(cedeVezNaFilaPorMensalidade(emDia, VENCEU, LIGADA), false, 'quem está em dia não cede');
assert.equal(cedeVezNaFilaPorMensalidade(semCampo, VENCEU, LIGADA), false,
  'registro SEM o campo mens_ok não é inadimplente — mesma regra do bloqueio');
assert.equal(cedeVezNaFilaPorMensalidade(isento, VENCEU, LIGADA), false, 'isento nunca cede a vez');

// ------------------------------------------------- a ordem da fila

// Jogo de 4 vagas, cheio. Na fila, por ordem de chegada: atrasado, em dia, em dia.
const players = [
  ...[1, 2, 3, 4].map((n) => jogador(n + 10)),          // p11..p14, confirmados
  jogador(20, { mens_ok: false }),                       // chegou primeiro, em atraso
  jogador(21),                                           // chegou depois, em dia
  jogador(22),                                           // chegou por último, em dia
];

const base = {
  players,
  game: VENCEU,
  games: [VENCEU],
  active_game_id: JOGO,
  confirmations: [
    ...[11, 12, 13, 14].map((n) => confirmado(`p${n}`)),
    naFila('p20', '2026-10-01T10:00:00.000Z'),
    naFila('p21', '2026-10-01T11:00:00.000Z'),
    naFila('p22', '2026-10-01T12:00:00.000Z'),
  ],
  session: { playerId: 'p11' },
  ui: { currentTab: 'weekly_game' },
};

replaceState({ ...base, settings: {} });
assert.deepEqual(getWaitlistView().map((e) => e.player_id), ['p20', 'p21', 'p22'],
  'desligada: vale a ordem de chegada, e quem deve não perde o lugar');

replaceState({ ...base, settings: LIGADA });
assert.deepEqual(getWaitlistView().map((e) => e.player_id), ['p21', 'p22', 'p20'],
  'ligada: quem está em dia passa na frente, e entre eles a chegada decide');

// A tela mostra a posição que vale: #1 é quem entra.
assert.deepEqual(getWaitlistView().map((e) => e.position), [1, 2, 3], 'a numeração acompanha a ordem');

// ------------------------------------------------- quem entra é quem a tela diz

// Alguém de dentro cancela: abre uma vaga e o primeiro da fila entra.
const cancelou = toggleConfirmation('p11');
assert.equal(cancelou.ok, true, 'o confirmado cancelou');
assert.equal(cancelou.promotedPlayerId, 'p21', 'entrou quem estava em dia, não quem chegou primeiro');

const depois = getState().confirmations;
assert.equal(depois.find((e) => e.player_id === 'p21').confirmed, true, 'p21 está no jogo');
assert.equal(depois.find((e) => e.player_id === 'p20').status, 'waitlist', 'o inadimplente segue na fila');
assert.equal(getWaitlistView().map((e) => e.player_id).join(','), 'p22,p20',
  'e a fila se renumera mantendo a preferência');

console.log('ok - fila: quem está em dia entra primeiro, e a tela mostra a fila que vale');
