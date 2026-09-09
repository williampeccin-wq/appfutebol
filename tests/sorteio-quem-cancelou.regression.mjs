// INCIDENTE 09/09/2026 (Harmonia): jogadores cancelaram a presença DEPOIS do
// sorteio e continuaram escalados no time para todo mundo.
//
// Cadeia real:
//   1. o sorteio mora no blob `app_meta`, que é admin-only no servidor;
//   2. cancelar presença chama buildDrawRemovalPatch, que tira a pessoa do time
//      no estado LOCAL;
//   3. quem cancelou era jogador comum: a linha de presença (que é dele) grava,
//      o blob do sorteio não — a gravação é recusada;
//   4. resultado: a presença mostra que saiu e o time continua mostrando que joga.
//
// Regra: a presença é a verdade sobre quem joga. A exibição do sorteio cruza os
// dois na hora de mostrar, em vez de confiar só no que está gravado — assim o
// jogo em andamento se corrige sozinho, sem depender de um admin re-sortear.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';
import { semQuemCancelou, timesDoSorteio } from '../appfutebol_run/js/domain/draw-teams.js';

const JOGO = 'g_2026-09-11_2000';
const conf = (playerId, extra = {}) => ({ game_key: JOGO, player_id: playerId, confirmed: true, status: 'confirmed', ...extra });
const cancelou = (playerId) => conf(playerId, { confirmed: false, status: 'cancelled' });

const sorteio = { id: 'd1', team_a: ['p1', 'p2'], team_b: ['p3', 'p4'] };

// ------------------------------------------------- o caso do incidente

const doisSairam = semQuemCancelou(sorteio, [conf('p1'), cancelou('p2'), conf('p3'), cancelou('p4')], JOGO);
assert.deepEqual(timesDoSorteio(doisSairam), [['p1'], ['p3']],
  'quem cancelou depois do sorteio sai do time na exibição');
assert.deepEqual(timesDoSorteio(sorteio), [['p1', 'p2'], ['p3', 'p4']],
  'o sorteio gravado não é mutado — a filtragem é só de leitura');

// O número de times não muda, mesmo que um deles esvazie: o rodízio de 3 times
// conta com o índice para rótulo e uniforme.
const timeInteiroSaiu = semQuemCancelou(sorteio, [cancelou('p3'), cancelou('p4')], JOGO);
assert.equal(timesDoSorteio(timeInteiroSaiu).length, 2, 'time vazio continua existindo');
assert.deepEqual(timesDoSorteio(timeInteiroSaiu)[1], [], 'e vazio de verdade');

// ------------------------------------------------- o que NÃO pode sair

// Convidado e goleiro de aluguel não têm linha de presença. Só sai quem tem
// PROVA de cancelamento; ausência de confirmação não é prova.
const comConvidado = { teams: [['p1', { id: 'g_1', name: 'Goleiro de aluguel', rental_goalkeeper: true }], ['p2', { id: 'c_1', name: 'Convidado', guest: true }]] };
const filtrado = semQuemCancelou(comConvidado, [cancelou('p1')], JOGO);
assert.deepEqual(timesDoSorteio(filtrado)[0].map((e) => (typeof e === 'object' ? e.id : e)), ['g_1'],
  'goleiro de aluguel fica; o jogador que cancelou sai');
assert.deepEqual(timesDoSorteio(filtrado)[1].map((e) => (typeof e === 'object' ? e.id : e)), ['p2', 'c_1'],
  'convidado fica, e quem não cancelou também');

// Cancelamento de OUTRO jogo não afeta este. O escopo por game_key é estrito —
// é o que impede confirmação de um jogo vazar para o seguinte.
const outroJogo = semQuemCancelou(sorteio, [{ ...cancelou('p1'), game_key: 'g_outro' }], JOGO);
assert.deepEqual(timesDoSorteio(outroJogo), [['p1', 'p2'], ['p3', 'p4']],
  'cancelamento de outro jogo não mexe neste sorteio');

// Entrada sem game_key não vaza (mesma regra do belongsToGame).
const semChave = semQuemCancelou(sorteio, [{ player_id: 'p1', confirmed: false, status: 'cancelled' }], JOGO);
assert.deepEqual(timesDoSorteio(semChave), [['p1', 'p2'], ['p3', 'p4']],
  'entrada sem game_key não tira ninguém');

// ------------------------------------------------- identidade e bordas

assert.equal(semQuemCancelou(sorteio, [conf('p1'), conf('p2')], JOGO), sorteio,
  'ninguém cancelou: devolve o MESMO objeto, para não sujar o diff do save');
assert.equal(semQuemCancelou(sorteio, [], JOGO), sorteio, 'sem confirmações, nada muda');
assert.equal(semQuemCancelou(null, [cancelou('p1')], JOGO), null, 'sem sorteio, nada explode');
assert.deepEqual(timesDoSorteio(semQuemCancelou(sorteio, null, JOGO)), [['p1', 'p2'], ['p3', 'p4']],
  'confirmações inválidas não derrubam a tela');

// Fila de espera não joga: quem foi para a fila depois do sorteio também sai.
const naFila = semQuemCancelou(sorteio, [conf('p2', { confirmed: false, status: 'waitlist' })], JOGO);
assert.deepEqual(timesDoSorteio(naFila), [['p1'], ['p3', 'p4']],
  'quem virou fila de espera sai do time escalado');

console.log('OK — 13 asserções. O sorteio exibido segue a presença, não a foto do momento do sorteio.');
