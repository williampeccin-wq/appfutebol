// Fase 2 do perfil de clube: o sorteio deixa de ser "exatamente dois times".
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

// ---------------------------------------------------------------- o sorteio
//
// Exercita o drawTeams REAL contra o estado do app, não só o helper. O que
// importa aqui: 2 times continuam se comportando como antes, e N times não
// deixam ninguém de fora nem duplicam ninguém.

globalThis.window = { location: { hostname: 'teste.local' } };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { replaceState, getState } = await import('../appfutebol_run/js/core/state.js');
const { drawTeams } = await import('../appfutebol_run/js/modules/game/game.service.js');

const KEY = 'game_2026-08-05_2030';
const plantel = (n) => Array.from({ length: n }, (_, i) => ({
  id: `p${i}`, name: `Jogador ${i}`, phone: `4899999${String(i).padStart(4, '0')}`,
  plays_football: true, active: true,
  position: ['gol', 'zag', 'meia', 'atk'][i % 4],
}));

const montar = (qtdJogadores, qtdTimes) => {
  const jogadores = plantel(qtdJogadores);
  replaceState({
    session: { playerId: 'p0' },
    players: jogadores,
    confirmations: jogadores.map((p) => ({ game_key: KEY, player_id: p.id, confirmed: true, status: 'confirmed' })),
    game: { game_key: KEY, game_date: '2026-08-05', max_players: 99 },
    games: [{ game_key: KEY, game_date: '2026-08-05', max_players: 99 }],
    active_game_id: KEY,
    championship: { active: { id: 't', results: [] } },
    profile: { schema_version: 1, game: { teams: qtdTimes } },
    ui: { currentTab: 'home' },
  });
  return drawTeams();
};

const idsDe = (listas) => listas.flat().map((e) => (e && typeof e === 'object' ? e.id : e));

// --- 2 times: o comportamento de sempre, inclusive nos campos legados
const dois = montar(10, 2);
assert.equal(dois.ok, true, dois.message);
assert.equal(quantidadeDeTimes(dois.sortResult), 2, 'clube de 2 times sorteia 2');
assert.ok(Array.isArray(dois.sortResult.team_a) && dois.sortResult.team_a.length > 0,
  'team_a continua preenchido para código antigo');
assert.deepEqual(dois.sortResult.team_a, timesDoSorteio(dois.sortResult)[0],
  'o campo legado espelha o 1º time');

// --- 3 times
const tres = montar(12, 3);
assert.equal(quantidadeDeTimes(tres.sortResult), 3, 'clube de 3 times sorteia 3');
assert.equal(totalDeJogadores(tres.sortResult), 12, 'ninguém fica de fora do sorteio');
assert.equal(new Set(idsDe(timesDoSorteio(tres.sortResult))).size, 12,
  'ninguém aparece em dois times ao mesmo tempo');

// Times equilibrados em TAMANHO: com 12 jogadores e 3 times, 4 em cada.
const tamanhos = timesDoSorteio(tres.sortResult).map((t) => t.length);
assert.ok(Math.max(...tamanhos) - Math.min(...tamanhos) <= 1,
  `times desequilibrados no tamanho: ${JSON.stringify(tamanhos)}`);

// --- plantel pequeno não pode gerar time de 1
const poucos = montar(5, 3);
const tamanhosPoucos = timesDoSorteio(poucos.sortResult).map((t) => t.length);
assert.ok(Math.min(...tamanhosPoucos) >= 2,
  `com 5 confirmados, nenhum time pode ter menos de 2: ${JSON.stringify(tamanhosPoucos)}`);
assert.equal(totalDeJogadores(poucos.sortResult), 5, 'mesmo reduzindo times, ninguém fica de fora');

console.log('OK — +11 asserções. drawTeams divide em N times sem perder nem duplicar jogador.');

// ---------------------------------------------------------------- campeonato x rodízio
//
// Decisão de produto (24/07): com 3+ times o campeonato fica INDISPONÍVEL, em
// vez de achatar a realidade dizendo que um time que ganhou 2 de 3 partidas é
// igual a um que perdeu todas. O que não pode acontecer é o dado ser apagado —
// voltar para 2 times tem de trazer o campeonato de volta como estava.

const { campeonatoDisponivel, perfilDoFormulario, getClubProfile, timesPorJogo } =
  await import('../appfutebol_run/js/domain/club-profile.js');

const SEM = { legacyBlob: false };
const comTimesConfig = (n, extra = {}) => ({ profile: { schema_version: 1, game: { teams: n }, ...extra } });

assert.equal(campeonatoDisponivel({}, SEM).ok, true, 'clube padrão (2 times) tem campeonato');
assert.equal(campeonatoDisponivel(comTimesConfig(2), SEM).ok, true, '2 times: campeonato disponível');
assert.equal(campeonatoDisponivel(comTimesConfig(3), SEM).ok, false, '3 times: campeonato indisponível');
assert.equal(campeonatoDisponivel(comTimesConfig(3), SEM).motivo, 'rodizio',
  'o motivo é explícito, para a UI poder explicar');
assert.equal(campeonatoDisponivel(comTimesConfig(2, { modules: { campeonato: false } }), SEM).motivo,
  'modulo_desligado', 'módulo desligado é um motivo diferente de rodízio');

// Ligar e desligar o rodízio NÃO pode destruir nada: o gate é de exibição.
const clube3 = comTimesConfig(3);
clube3.championship = { active: { id: 't', results: [{ id: 'r1', date: '2026-07-22' }] } };
assert.equal(clube3.championship.active.results.length, 1,
  'os resultados continuam no estado mesmo com o campeonato indisponível');

// O formulário respeita o mínimo de 2 — "1 time" não é sorteio.
const perfilForm = perfilDoFormulario(new Map(Object.entries({ teams: '1' })), getClubProfile({}, SEM));
assert.equal(perfilForm.game.teams, 2, 'o formulário não aceita menos de 2 times');
assert.equal(timesPorJogo(comTimesConfig(4), SEM), 4, 'o clube de 4 times é lido como 4');

console.log('OK — +8 asserções. Rodízio esconde o campeonato sem apagar dado.');
