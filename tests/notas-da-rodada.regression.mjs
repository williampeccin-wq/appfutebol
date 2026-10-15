// Notas da rodada: a média de cada um NAQUELE jogo, à mostra por 12h depois que
// a votação de desempenho fecha.
//
// O que este teste trava:
// - nunca aparece durante a votação (a parcial ancoraria quem ainda vota);
// - aparece no instante em que a votação fecha e some 12h depois;
// - o ranking é só daquele jogo, e quem tem menos de 3 votos fica sem média;
// - a votação e as notas usam a MESMA janela (getPerfWindow delega para cá);
// - a Edge Function do push repete a regra com as mesmas 12h.
//
// Rodar: node tests/notas-da-rodada.regression.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  janelaDaVotacao,
  janelaDasNotas,
  jogoComNotasAMostra,
  modoNotasDaRodada,
  notasDaRodada,
  formatarMedia,
  NOTAS_RODADA_HORAS,
} from '../appfutebol_run/js/modules/notas/notas.service.js';

const H = 3600_000;
const LANCADO = '2026-10-11T23:30:00.000Z';
const lancadoMs = Date.parse(LANCADO);
const results = [
  { date: '2026-10-04', created_at: '2026-10-04T23:00:00.000Z' },
  { date: '2026-10-11', created_at: LANCADO },
];
const games = [
  { game_key: 'game_2026-10-04_2030', game_date: '2026-10-04' },
  { game_key: 'game_2026-10-11_2030', game_date: '2026-10-11' },
  { game_key: 'game_2026-10-18_2030', game_date: '2026-10-18' }, // sem resultado
];

// Janela da votação: abre no lançamento, dura as horas configuradas.
assert.deepEqual(janelaDaVotacao(results, '2026-10-11', 6), { openMs: lancadoMs, closeMs: lancadoMs + 6 * H });
assert.equal(janelaDaVotacao(results, '2026-10-11', 0), null, 'votação desligada não tem janela');
assert.equal(janelaDaVotacao(results, '2026-10-18', 6), null, 'sem resultado lançado não há votação');

// Notas: do fim da votação até 12h depois.
assert.equal(NOTAS_RODADA_HORAS, 12);
assert.deepEqual(janelaDasNotas(results, '2026-10-11', 6), { openMs: lancadoMs + 6 * H, closeMs: lancadoMs + 18 * H });

// Durante a votação: nada à mostra.
assert.equal(jogoComNotasAMostra(games, results, 6, lancadoMs + 5 * H), null);
// Fechou: aparece o jogo de 11/10.
assert.equal(jogoComNotasAMostra(games, results, 6, lancadoMs + 6 * H)?.game_key, 'game_2026-10-11_2030');
assert.equal(jogoComNotasAMostra(games, results, 6, lancadoMs + 17.9 * H)?.game_key, 'game_2026-10-11_2030');
// 12h depois: some.
assert.equal(jogoComNotasAMostra(games, results, 6, lancadoMs + 18 * H), null);

// Modo: ranking completo é o padrão; valor estranho cai no padrão.
assert.equal(modoNotasDaRodada({}), 'completo');
assert.equal(modoNotasDaRodada({ ratings_reveal_mode: 'so_minha' }), 'so_minha');
assert.equal(modoNotasDaRodada({ ratings_reveal_mode: 'desligado' }), 'desligado');
assert.equal(modoNotasDaRodada({ ratings_reveal_mode: 'qualquer' }), 'completo');

// Ranking só do jogo pedido.
const voto = (jogo, alvo, nota) => ({ kind: 'desempenho', game_key: jogo, target_id: alvo, score: nota });
const J = 'game_2026-10-11_2030';
const votos = [
  voto(J, 'zeca', 9), voto(J, 'zeca', 8), voto(J, 'zeca', 10),
  voto(J, 'bibi', 7), voto(J, 'bibi', 7), voto(J, 'bibi', 7), voto(J, 'bibi', 7),
  voto(J, 'tito', 6), voto(J, 'tito', 8), voto(J, 'tito', 7), // 7,0 com 3 votos: empata com bibi, perde no nº de votos
  voto(J, 'novo', 10), voto(J, 'novo', 10),                   // só 2 votos
  voto('game_2026-10-04_2030', 'tito', 1),                    // outro jogo: fora
  { kind: 'churrasco', game_key: J, target_id: 'zeca', score: 1 }, // outro tipo: fora
];
const linhas = notasDaRodada(votos, J);
assert.deepEqual(linhas.map((l) => l.id), ['zeca', 'bibi', 'tito', 'novo']);
assert.deepEqual(linhas.map((l) => l.posicao), [1, 2, 3, null]);
assert.equal(linhas[0].media, 9);
assert.equal(linhas[2].media, 7, 'o voto 1 do jogo anterior não entra na média de tito');
assert.equal(linhas[3].poucosVotos, true, 'com 2 votos a média apontaria quem votou');
assert.equal(formatarMedia(7.44), '7,4', 'vírgula, uma casa');
assert.equal(formatarMedia(9), '9,0');
assert.deepEqual(notasDaRodada([], J), []);

// O app usa a mesma janela para abrir o modal de voto.
const app = readFileSync(new URL('../appfutebol_run/js/core/app.js', import.meta.url), 'utf8');
assert.match(app, /function getPerfWindow[\s\S]{0,600}janelaDaVotacao\(/, 'getPerfWindow precisa delegar para janelaDaVotacao');

// O push de "votação encerrada" usa as mesmas 12h, e deduplica antes de inserir.
const edge = readFileSync(new URL('../supabase/functions/auto-open-games/index.ts', import.meta.url), 'utf8');
assert.match(edge, /const NOTAS_RODADA_HORAS = 12;/);
assert.match(edge, /claimUmaVez\(KIND_NOTAS/);

// O modo precisa sobreviver ao ida-e-volta com o servidor (whitelist de settings).
const storage = readFileSync(new URL('../appfutebol_run/js/services/storage.supabase.js', import.meta.url), 'utf8');
assert.equal((storage.match(/ratings_reveal_mode:/g) || []).length, 2, 'ratings_reveal_mode no composeState E no splitState');

console.log('ok — notas da rodada');
