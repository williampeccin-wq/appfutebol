// INCIDENTE 29/09/2026 (Harmonia): o jogo de 30/09 amanheceu com 17 confirmados
// de linha para 16 vagas — e a tela mostrava "100% preenchido, 0 vagas" com 17
// gente dentro.
//
// Cadeia real (confirmada no banco de produção):
//   1. o 16º (Vitor) confirmou às 10:38 e fechou o jogo;
//   2. às 16:57 o aparelho de um admin promoveu o Lukinha da fila de espera —
//      a promoção automática conta vaga por conta própria e o servidor aceita
//      qualquer gravação em presence_confirmations: `max_players` só existia no
//      cliente, nenhuma constraint, trigger ou Edge Function conhecia o limite;
//   3. o push "Você está dentro!" saiu, e o 17º virou fato consumado.
//
// Regra, em duas metades:
//   - o BANCO passa a recusar confirmação de linha acima de max_players
//     (trigger trg_presence_line_capacity, migration 20260929190000);
//   - a INTERFACE se rende à recusa: a confirmação fantasma que ficou só no
//     aparelho vira fila de espera, em vez de mostrar uma vaga que não existe.
//
// Aqui cobrimos a metade que roda em JS: a conta de vaga (quem ocupa o quê) e o
// caminho de rendição da interface.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';
import { isGameFull } from '../appfutebol_run/js/domain/rules.engine.js';
import { replaceState, getState } from '../appfutebol_run/js/core/state.js';
import { moverParaFilaPorRecusaDeLotacao } from '../appfutebol_run/js/modules/game/game.service.js';

const JOGO = 'game_2026-09-30_2030';

const linha = (n) => ({
  id: `p${n}`,
  name: `Jogador ${n}`,
  // telefone válido: o guard do replaceState descarta player sem ele
  phone: `5199000${String(n).padStart(4, '0')}`,
  position: 'meia',
  plays_football: true,
  mens_ok: true,
});
const goleiro = (n) => ({ ...linha(n), position: 'gol' });
const conf = (playerId, extra = {}) => ({ game_key: JOGO, player_id: playerId, confirmed: true, status: 'confirmed', ...extra });

// ------------------------------------------------- a conta de vaga

const quinze = Array.from({ length: 15 }, (_, i) => conf(`p${i + 1}`));
const jogo = { game_key: JOGO, id: JOGO, max_players: 16, open: true };

assert.equal(isGameFull(jogo, quinze), false, '15 de 16: ainda tem vaga');
assert.equal(isGameFull(jogo, [...quinze, conf('p16')]), true, '16 de 16: lotado');

// Goleiro tem segmento próprio e NÃO ocupa vaga de linha — é por isso que o
// jogo de 30/09 fechou com 19 linhas confirmadas no banco (17 + 2 goleiros).
const comGoleiros = [...quinze, conf('gk1', { goalkeeper: true }), conf('gk2', { segment: 'goalkeeper' })];
assert.equal(isGameFull(jogo, comGoleiros), false, 'goleiro confirmado não consome vaga de linha');

// Convidado de linha ocupa vaga igual a um confirmado; convidado goleiro, não.
const comConvidadoDeLinha = { ...jogo, guest_players: [{ id: 'g1', name: 'Alex', position: 'meia' }] };
assert.equal(isGameFull(comConvidadoDeLinha, quinze), true, 'convidado de linha fecha a última vaga');

const comConvidadoGoleiro = { ...jogo, guest_players: [{ id: 'g2', name: 'Chico', position: 'gol' }] };
assert.equal(isGameFull(comConvidadoGoleiro, quinze), false, 'convidado goleiro não ocupa vaga de linha');

// ------------------------------------------------- a rendição da interface

const players = [...Array.from({ length: 16 }, (_, i) => linha(i + 1)), goleiro(90), goleiro(91)];
const confirmacoes = [
  ...Array.from({ length: 16 }, (_, i) => conf(`p${i + 1}`)),
  conf('p90', { goalkeeper: true }),
  conf('p91', { goalkeeper: true }),
];

replaceState({
  players,
  game: jogo,
  games: [jogo],
  active_game_id: JOGO,
  confirmations: confirmacoes,
  settings: {},
  session: { playerId: 'p16' },
  ui: { currentTab: 'home' },
});

// O 16º está confirmado; o servidor recusa a gravação dele por lotação (foi o
// caso do Lukinha: o aparelho achava que havia vaga, o banco sabe que não).
const resultado = moverParaFilaPorRecusaDeLotacao('p16');
assert.equal(resultado.ok, true, 'a recusa é aplicada em quem estava confirmado');
assert.equal(resultado.position, 1, 'e ele entra como primeiro da fila');

const depois = getState().confirmations.find((entry) => entry.player_id === 'p16');
assert.equal(depois.confirmed, false, 'a confirmação fantasma cai');
assert.equal(depois.status, 'waitlist', 'e vira fila de espera');
assert.equal(depois.waitlist_position, 1, 'com posição na fila');
assert.ok(depois.waitlisted_at, 'e com a hora de entrada na fila, para a ordem valer');

// Idempotente: a recusa pode chegar duas vezes (retry do save) e não pode
// empurrar quem já está na fila, nem inventar entrada para quem cancelou.
const segundaVez = moverParaFilaPorRecusaDeLotacao('p16');
assert.equal(segundaVez.ok, false, 'recusa repetida não mexe em quem já está na fila');

const semConfirmacao = moverParaFilaPorRecusaDeLotacao('p999');
assert.equal(semConfirmacao.ok, false, 'recusa de quem não tem confirmação local não cria nada');

// Os outros 15 de linha e os 2 goleiros seguem confirmados: a rendição é
// cirúrgica, não um "recarrega tudo".
const aindaConfirmados = getState().confirmations.filter((entry) => entry.confirmed === true);
assert.equal(aindaConfirmados.length, 17, 'só a confirmação recusada saiu');

console.log('ok - lotação: banco manda, interface obedece');
