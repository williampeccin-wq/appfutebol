// Regressão da nota por temporada (fase B do design em docs/season-close-design.md).
//
// O que estourou em produção (Harmonia, 31/08/2026, logo após o primeiro
// encerramento): a temporada nova abriu com 0 ponto e 0 jogo, e a coluna ★
// continuou mostrando 6.3, 6.1, 6.9 — as notas da temporada ANTERIOR. A média
// nunca teve recorte: `playerRatingAverages` somava desde o primeiro voto.
//
// No mesmo encerramento apareceu o outro defeito coberto aqui: o cabeçalho
// anunciava "Inverno 2026" em cima das datas da temporada nova, porque o
// `label` não era normalizado e o meta ficava com o da constante.
//
// Rodar: node tests/nota-por-temporada.regression.mjs

import assert from 'node:assert/strict';
import {
  playerRatingAverages,
  rollingRatingWindow,
  dateOfGameKey,
} from '../appfutebol_run/js/services/ratings.service.js';
import { getActiveChampionshipMeta } from '../appfutebol_run/js/modules/championship/championship.service.js';

const voto = (data, alvo, nota) => ({ kind: 'desempenho', game_key: `game_${data}_2030`, target_id: alvo, score: nota });

const votos = [
  // Inverno 26 (temporada encerrada)
  voto('2026-07-15', 'p_zeca', 8),
  voto('2026-08-26', 'p_zeca', 10),
  voto('2026-08-26', 'p_bibi', 4),
  // Encerramento 26 (temporada nova)
  voto('2026-09-02', 'p_zeca', 6),
  // voto sem data (formato antigo) — não pertence a temporada nenhuma
  { kind: 'desempenho', game_key: 'default', target_id: 'p_zeca', score: 1 },
  // churrasco não entra na nota de desempenho
  { kind: 'churrasco', game_key: 'game_2026-09-02_2030', target_id: 'p_zeca', score: 10 },
];

// 1) A nota é DA TEMPORADA: a nova não herda as notas da anterior.
{
  const inverno = playerRatingAverages(votos, { start: '2026-05-01', end: '2026-08-31' });
  assert.deepEqual(inverno.p_zeca, { avg: 9, votes: 2, sum: 18 });
  assert.deepEqual(inverno.p_bibi, { avg: 4, votes: 1, sum: 4 });

  const nova = playerRatingAverages(votos, { start: '2026-09-01', end: '2026-12-31' });
  assert.deepEqual(nova.p_zeca, { avg: 6, votes: 1, sum: 6 },
    'a temporada nova só enxerga o voto dela — antes a coluna ★ mostrava 6.3 num campeonato de 0 jogo');
  assert.equal(nova.p_bibi, undefined, 'quem não recebeu voto na temporada nova não tem nota');
}

// 2) Sem janela, é vitalícia — o comportamento antigo, ainda usado onde faz
//    sentido somar tudo.
{
  const tudo = playerRatingAverages(votos);
  assert.equal(tudo.p_zeca.votes, 4, 'inclui o voto sem data quando não há recorte');
}

// 3) Voto de chave sem data fica FORA de qualquer janela — nunca é jogado por
//    engano na temporada corrente.
{
  assert.equal(dateOfGameKey('default'), null);
  const janelaLarga = playerRatingAverages(votos, { start: '2000-01-01', end: '2099-12-31' });
  assert.equal(janelaLarga.p_zeca.votes, 3, 'os 3 com data; o "default" fica de fora');
}

// 4) Janela móvel do sorteio: 12 meses para trás, independente da temporada.
//    É o que impede o índice de força de zerar junto com a classificação.
{
  const janela = rollingRatingWindow(12, '2026-09-02');
  assert.deepEqual(janela, { start: '2025-09-02', end: '2026-09-02' });

  const forca = playerRatingAverages(votos, janela);
  assert.equal(forca.p_zeca.votes, 3,
    'no 1º jogo da temporada nova o sorteio ainda enxerga as notas do quadrimestre anterior');

  // A temporada, no mesmo dia, enxerga um voto só — é a diferença que justifica
  // as duas janelas coexistirem.
  const temporada = playerRatingAverages(votos, { start: '2026-09-01', end: '2026-12-31' });
  assert.equal(temporada.p_zeca.votes, 1);
}

// 5) O cabeçalho segue a temporada corrente, não a constante do módulo.
{
  const snapshot = {
    players: [],
    championship: {
      active: {
        id: 'encerramento-2026', name: 'Encerramento 2026',
        start_date: '2026-09-01', end_date: '2026-12-31', year: 2026, results: [],
      },
      history: [{ id: 'inverno-2026', name: 'Inverno 26', year: 2026, rows: [] }],
    },
  };
  const meta = getActiveChampionshipMeta(snapshot);
  assert.equal(meta.label, 'Encerramento 2026',
    'sem a normalização do label o hero anunciava "Inverno 2026" em cima das datas da temporada nova');
  assert.equal(meta.name, 'Encerramento 2026');
  assert.equal(meta.start_date, '2026-09-01');
}

console.log('ok — nota por temporada e cabeçalho da temporada corrente');
