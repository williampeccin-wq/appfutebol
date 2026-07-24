// Fronteira de leitura de times do sorteio (domain/draw-teams.js).
// No production so a LEITURA foi portada — a imagem da escalacao precisa dela
// para ler team_a/team_b como lista de times. A F2 (sorteio de N times) NAO
// foi portada: o Harmonia joga 2 times e sera tombado para o Convocados.
//
// `team_a`/`team_b` não era um número, era o SHAPE do dado — espalhado por 7
// arquivos e por tudo que já está gravado no banco. Este módulo é a fronteira:
// nada mais lê o par diretamente.
//
// O risco desta mudança não é o caso novo (3 times), é o VELHO: todo sorteio já
// gravado está no formato antigo, e todo cliente com código em cache continua
// lendo `team_a`/`team_b`. Por isso metade das asserções aqui é sobre não
// quebrar o que existe.
//
// Rodar: node --test "tests/*.regression.mjs"

import assert from 'node:assert/strict';
import {
  comTimes, idDaEntrada, quantidadeDeTimes, rotuloDoTime, semJogador,
  timeDoJogador, timesDoSorteio, totalDeJogadores,
} from '../appfutebol_run/js/domain/draw-teams.js';

// ---------------------------------------------------------------- ler o legado

const legado = { id: 'd1', team_a: ['p1', 'p2'], team_b: ['p3'] };

assert.deepEqual(timesDoSorteio(legado), [['p1', 'p2'], ['p3']],
  'sorteio já gravado é lido como dois times, sem precisar de migração');
assert.equal(quantidadeDeTimes(legado), 2, 'formato antigo = 2 times');
assert.equal(totalDeJogadores(legado), 3, 'soma os jogadores dos dois times');

// Sorteio pela metade não pode virar "2 times, um vazio".
assert.equal(quantidadeDeTimes({ team_a: ['p1'] }), 1,
  'sem team_b, é um time só — não dois com um vazio');

// Entradas inválidas não derrubam a tela.
assert.deepEqual(timesDoSorteio(null), [], 'sorteio ausente vira lista vazia');
assert.deepEqual(timesDoSorteio({}), [[]], 'sorteio vazio não explode');

// ---------------------------------------------------------------- ler o novo

const tresTimes = { id: 'd2', teams: [['p1'], ['p2'], ['p3', 'p4']] };
assert.equal(quantidadeDeTimes(tresTimes), 3, 'três times são lidos como três');
assert.equal(totalDeJogadores(tresTimes), 4, 'soma os três times');

// `teams` MANDA quando existe: se um dia os dois formatos divergirem (código
// velho gravou team_a por cima), a verdade é o formato novo.
const divergente = { teams: [['x'], ['y'], ['z']], team_a: ['ANTIGO'], team_b: [] };
assert.deepEqual(timesDoSorteio(divergente), [['x'], ['y'], ['z']],
  'teams tem precedência sobre o par legado');

// ---------------------------------------------------------------- escrever

// A escrita grava nos DOIS formatos. É isso que impede a tela de ficar vazia
// para quem está com código antigo em cache (PWA + service worker).
const escrito = comTimes({ id: 'd3', game_key: 'g1' }, [['p1'], ['p2'], ['p3']]);
assert.deepEqual(escrito.teams, [['p1'], ['p2'], ['p3']], 'grava a verdade completa');
assert.deepEqual(escrito.team_a, ['p1'], 'grava o 1º time no campo legado');
assert.deepEqual(escrito.team_b, ['p2'], 'grava o 2º time no campo legado');
assert.equal(escrito.game_key, 'g1', 'preserva o resto do sorteio');

// Um time só: team_b existe e é vazio, em vez de sumir. Código velho faz
// `.length` nesses campos sem checar se existem.
const umTime = comTimes({}, [['p1']]);
assert.deepEqual(umTime.team_b, [], 'team_b vazio em vez de ausente');

// Ida e volta de um sorteio de 2 times é IDÊNTICO ao original — a mudança não
// pode alterar o que já funciona.
const ida = comTimes({}, timesDoSorteio(legado));
assert.deepEqual(ida.team_a, legado.team_a, 'ida e volta preserva team_a');
assert.deepEqual(ida.team_b, legado.team_b, 'ida e volta preserva team_b');

// ---------------------------------------------------------------- jogadores

// Convidado e goleiro de aluguel entram como OBJETO (não têm id persistente).
const comConvidado = { teams: [['p1', { id: 'guest_1', name: 'Amigo', guest: true }], ['p2']] };
assert.equal(idDaEntrada('p1'), 'p1', 'entrada string é o próprio id');
assert.equal(idDaEntrada({ id: 'guest_1' }), 'guest_1', 'entrada objeto tem o id dentro');

assert.equal(timeDoJogador(comConvidado, 'p1'), 0, 'acha jogador no 1º time');
assert.equal(timeDoJogador(comConvidado, 'p2'), 1, 'acha jogador no 2º time');
assert.equal(timeDoJogador(comConvidado, 'guest_1'), 0, 'acha convidado, que é objeto');
assert.equal(timeDoJogador(comConvidado, 'ninguem'), -1, 'quem não está devolve -1');

// Remover alguém não pode reduzir o número de times: um time que esvazia
// continua existindo (senão o "Time C" desapareceria no meio da noite).
const semP2 = semJogador(comConvidado, 'p2');
assert.equal(quantidadeDeTimes(semP2), 2, 'remover não elimina o time');
assert.deepEqual(timesDoSorteio(semP2)[1], [], 'o time fica vazio, mas continua lá');
assert.deepEqual(semJogador(comConvidado, 'guest_1').teams[0], ['p1'], 'remove convidado por id');

// ---------------------------------------------------------------- rótulos

assert.equal(rotuloDoTime(0), 'A', 'primeiro time é o A');
assert.equal(rotuloDoTime(2), 'C', 'terceiro time é o C');
assert.equal(rotuloDoTime(9), '10', 'além das letras, cai no número em vez de undefined');

console.log('OK — 24 asserções. Sorteio de N times, sem quebrar o que já está gravado.');
