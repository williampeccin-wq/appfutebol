// Regressão: carne_schedule (entrada datada) deve ter prioridade sobre o
// cálculo do rodízio (carne_rotation) quando a data bate com o jogo.
//
// Incidente que originou o teste: admin alterou a dupla via tabela de datas
// mas a votação continuava apontando para a dupla do rodízio, ignorando a troca.
//
// Rodar: node --test tests/carne-dupla-priority.regression.mjs

import assert from 'node:assert/strict';
import { getChurrascoDuo } from '../appfutebol_run/js/domain/carne.js';

const PLAYERS = [
  { id: 'p1', name: 'Alpha' },
  { id: 'p2', name: 'Beta' },
  { id: 'p3', name: 'Gamma' },
  { id: 'p4', name: 'Delta' },
];

// Rodízio: semana 0 (2026-08-12) → p1+p2
const ROTATION = {
  start_date: '2026-08-12',
  pairs: [
    { player1_id: 'p1', player2_id: 'p2' },
    { player1_id: 'p3', player2_id: 'p4' },
  ],
};

const GAME = { game_date: '2026-08-12' };

// 1. Sem override datado → usa o rodízio (p1+p2)
{
  const duo = getChurrascoDuo([], ROTATION, PLAYERS, GAME.game_date);
  assert.ok(duo, 'deve retornar dupla quando só há rodízio');
  const ids = new Set([String(duo.player1.id), String(duo.player2.id)]);
  assert.ok(ids.has('p1') && ids.has('p2'), `rodízio deve retornar p1+p2, recebeu ${[...ids]}`);
}

// 2. Com override datado para a mesma data → usa o override (p3+p4), ignora rodízio
{
  const scheduleEntries = [
    { date: '2026-08-12', player1_id: 'p3', player2_id: 'p4' },
  ];
  const duo = getChurrascoDuo(scheduleEntries, ROTATION, PLAYERS, GAME.game_date);
  assert.ok(duo, 'deve retornar dupla com override datado');
  const ids = new Set([String(duo.player1.id), String(duo.player2.id)]);
  assert.ok(ids.has('p3') && ids.has('p4'), `override deve retornar p3+p4, recebeu ${[...ids]}`);
}

// 3. Override para data DIFERENTE → não interfere; rodízio decide
{
  const scheduleEntries = [
    { date: '2026-08-19', player1_id: 'p3', player2_id: 'p4' },
  ];
  const duo = getChurrascoDuo(scheduleEntries, ROTATION, PLAYERS, GAME.game_date);
  assert.ok(duo, 'override de outra data não deve bloquear');
  const ids = new Set([String(duo.player1.id), String(duo.player2.id)]);
  assert.ok(ids.has('p1') && ids.has('p2'), `rodízio deve prevalecer quando override não casa, recebeu ${[...ids]}`);
}

// 4. Sem rodízio e sem override → null
{
  const duo = getChurrascoDuo([], null, PLAYERS, GAME.game_date);
  assert.strictEqual(duo, null, 'sem dados deve retornar null');
}

// 5. Sem game_date → null
{
  const duo = getChurrascoDuo([], ROTATION, PLAYERS, '');
  assert.strictEqual(duo, null, 'sem data do jogo deve retornar null');
}

console.log('carne-dupla-priority: todos os casos OK');
