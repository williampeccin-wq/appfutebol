// Regressão do encerramento de temporada (fase A do design em
// docs/season-close-design.md).
//
// O buraco original: `end_date` era só texto no hero. A classificação somava
// TODOS os resultados, então o jogo de setembro entrava no Inverno 26 — uma
// temporada que a própria tela dizia ter terminado em 31/08 — e a classificação
// final do quadrimestre nunca era congelada em lugar nenhum.
//
// Rodar: node tests/temporada-encerramento.regression.mjs

import assert from 'node:assert/strict';
import {
  calculateAnnualRanking,
  calculateCurrentRanking,
  closeSeason,
  getFrozenSeasons,
  getFrozenYears,
  getOutOfSeasonResults,
  getSeasonResults,
  getSeasonStatus,
  seasonWindowChangeImpact,
  suggestNextSeason,
  updateSeason,
} from '../appfutebol_run/js/modules/championship/championship.service.js';
import { dateOfGameKey } from '../appfutebol_run/js/services/ratings.service.js';

const JOGO_JULHO = 'game_2026-07-15_2030';
const JOGO_SETEMBRO = 'game_2026-09-02_2030';

const rodada = (id, date, gameKey, statuses) => ({
  id, date, game_key: gameKey, created_at: `${date}T23:00:00.000Z`,
  outcome: 'team_a', team_a: ['p_zeca'], team_b: ['p_bibi'], statuses,
});

const snapshot = () => ({
  players: [
    { id: 'p_zeca', name: 'Zeca', plays_football: true, active: true },
    { id: 'p_bibi', name: 'Bibi', plays_football: true, active: true },
  ],
  games: [
    { game_key: JOGO_JULHO, game_date: '2026-07-15' },
    { game_key: JOGO_SETEMBRO, game_date: '2026-09-02' },
  ],
  settings: {},
  championship: {
    active: {
      id: 'inverno-2026', name: 'Inverno 26', year: 2026,
      start_date: '2026-05-01', end_date: '2026-08-31',
      results: [
        rodada('r_julho', '2026-07-15', JOGO_JULHO, { p_zeca: 'win', p_bibi: 'loss' }),
        rodada('r_setembro', '2026-09-02', JOGO_SETEMBRO, { p_zeca: 'win', p_bibi: 'loss' }),
      ],
    },
  },
});

// Votos: um jogo DENTRO da janela, outro FORA. A data sai do próprio game_key.
const votos = [
  { kind: 'desempenho', game_key: JOGO_JULHO, target_id: 'p_zeca', score: 8 },
  { kind: 'desempenho', game_key: JOGO_JULHO, target_id: 'p_zeca', score: 10 },
  { kind: 'desempenho', game_key: JOGO_SETEMBRO, target_id: 'p_zeca', score: 2 },
  { kind: 'churrasco', game_key: JOGO_JULHO, target_id: 'p_zeca', score: 1 },
];

const pontosDe = (ranking, id) => ranking.find((row) => row.player_id === id)?.points ?? null;

// ---------------------------------------------------------------------------
// 1) A janela da temporada vale: o jogo de setembro NÃO conta no Inverno 26.
{
  const estado = snapshot();
  assert.equal(getSeasonResults(estado).length, 1, 'só a rodada de julho está na janela');
  assert.equal(getOutOfSeasonResults(estado).length, 1, 'a de setembro fica marcada como fora');
  assert.equal(pontosDe(calculateCurrentRanking(estado), 'p_zeca'), 3,
    'antes desta correção somava 6: o jogo de setembro entrava numa temporada encerrada');
}

// 2) Clube SEM datas na temporada não tem janela — continua somando tudo.
{
  const estado = snapshot();
  estado.championship.active.start_date = '';
  estado.championship.active.end_date = '';
  assert.equal(pontosDe(calculateCurrentRanking(estado), 'p_zeca'), 6,
    'sem janela definida o comportamento antigo é preservado');
  assert.deepEqual(getOutOfSeasonResults(estado), [], 'sem janela nada fica "fora"');
}

// 3) O status alimenta o aviso e as travas do encerramento.
{
  const estado = snapshot();
  const status = getSeasonStatus(estado, { today: '2026-09-05', nowMs: Date.parse('2026-09-05T12:00:00Z') });
  assert.equal(status.ended, true);
  assert.equal(status.outOfSeason.length, 1);
  assert.equal(status.pendingGames.length, 0, 'os dois jogos do período têm resultado');
  assert.equal(status.openVoting.length, 0, 'sem ratings_perf_window_hours não há votação aberta');

  // Votação ainda aberta trava o encerramento (congelaria a nota pela metade).
  const votando = snapshot();
  votando.settings.ratings_perf_window_hours = 48;
  const aberta = getSeasonStatus(votando, { today: '2026-07-16', nowMs: Date.parse('2026-07-16T10:00:00Z') });
  assert.equal(aberta.openVoting.length, 1, 'a janela de votação de julho ainda estava aberta');

  // Jogo do período sem resultado lançado também trava.
  const pendente = snapshot();
  pendente.games.push({ game_key: 'game_2026-08-26_2030', game_date: '2026-08-26' });
  const comPendencia = getSeasonStatus(pendente, { today: '2026-09-05', nowMs: Date.parse('2026-09-05T12:00:00Z') });
  assert.equal(comPendencia.pendingGames.length, 1);
  assert.equal(comPendencia.pendingGames[0].date, '2026-08-26');
}

// 4) O voto é datado pelo game_key — sem tocar em created_at.
{
  assert.equal(dateOfGameKey(JOGO_JULHO), '2026-07-15');
  assert.equal(dateOfGameKey('default'), null, 'chave sem data fica fora de qualquer temporada');
  assert.equal(dateOfGameKey(''), null);
}

// ---------------------------------------------------------------------------
// 5) Encerrar congela pontos E notas, migra o que estava fora e zera o resto.
{
  const estado = snapshot();
  const fecho = closeSeason(estado, {
    nextSeason: { name: 'Primavera 26', start_date: '2026-09-01', end_date: '2026-12-31', year: 2026 },
    ratingRows: votos,
    closedBy: 'p_admin',
    now: '2026-09-05T22:00:00.000Z',
  });

  assert.equal(fecho.ok, true);
  const congelada = getFrozenSeasons(estado)[0];
  assert.equal(congelada.name, 'Inverno 26');
  assert.equal(congelada.rows.find((r) => r.player_id === 'p_zeca').points, 3);

  // Nota: só os votos de desempenho do jogo DENTRO da janela (8 e 10).
  const notaZeca = congelada.rows.find((r) => r.player_id === 'p_zeca').rating;
  assert.deepEqual(notaZeca, { sum: 18, votes: 2, avg: 9 },
    'o voto 2 do jogo de setembro e o voto de churrasco não podem entrar');

  // A rodada de setembro migrou para a temporada nova; a de julho ficou no congelado.
  assert.equal(estado.championship.active.name, 'Primavera 26');
  assert.deepEqual(estado.championship.active.results.map((r) => r.id), ['r_setembro'],
    'o que estava fora da janela migra em vez de sumir');
  assert.deepEqual(congelada.results.map((r) => r.id), ['r_julho']);

  // A nova temporada começa do zero — e agora setembro conta nela.
  assert.equal(pontosDe(calculateCurrentRanking(estado), 'p_zeca'), 3);

  // 6) Temporada encerrada é FATO: mudar a pontuação do clube depois não a reescreve.
  estado.profile = { championship: { points: { win: 10, draw: 5, loss: 2, no_play: 0 } } };
  assert.equal(getFrozenSeasons(estado)[0].rows.find((r) => r.player_id === 'p_zeca').points, 3,
    'o congelado não pode ser recalculado por configuração posterior');
  assert.deepEqual(congelada.points_table, { win: 3, draw: 2, loss: 1, no_play: 0 },
    'a regra usada na apuração fica registrada junto');

  // 7) O anual não perde a temporada encerrada.
  delete estado.profile;
  const anual = calculateAnnualRanking(estado);
  const zeca = anual.find((row) => row.player_id === 'p_zeca');
  assert.equal(zeca.points, 6, 'Inverno 26 congelado (3) + Primavera 26 em andamento (3)');
  assert.equal(zeca.closed_points, 3);
  assert.equal(zeca.current_points, 3);

  // 8) Encerrar de novo a mesma temporada é recusado.
  const estado2 = snapshot();
  estado2.championship.history = [{ id: 'inverno-2026', name: 'Inverno 26', rows: [] }];
  assert.deepEqual(closeSeason(estado2, {
    nextSeason: { name: 'X', start_date: '2026-09-01', end_date: '2026-12-31' },
  }), { ok: false, reason: 'season_already_closed' });
}

// ---------------------------------------------------------------------------
// 9) Virada de ano: fechar a última temporada de 2026 consolida o anual sozinho.
{
  const estado = snapshot();
  closeSeason(estado, {
    nextSeason: { name: 'Verão 27', start_date: '2027-01-01', end_date: '2027-04-30', year: 2027 },
    ratingRows: votos,
    now: '2026-12-31T22:00:00.000Z',
  });

  const anos = getFrozenYears(estado);
  assert.equal(anos.length, 1, 'o ano fecha junto — não é um segundo ritual que dá para esquecer');
  assert.equal(anos[0].year, 2026);
  const zeca = anos[0].rows.find((row) => row.player_id === 'p_zeca');
  assert.equal(zeca.points, 3);
  assert.deepEqual(zeca.rating, { sum: 18, votes: 2, avg: 9 });

  // O anual de 2027 começa do zero: o ano anterior não é cumulativo.
  const anual = calculateAnnualRanking(estado);
  assert.equal(anual.find((row) => row.player_id === 'p_zeca').points, 0,
    '2026 ficou para trás — o congelado de outro ano não entra no anual novo');

  // A rodada de setembro migrou, mas não cabe na janela do Verão 27 tampouco:
  // fica VISÍVEL como fora da temporada em vez de sumir ou entrar onde não é.
  assert.deepEqual(estado.championship.active.results.map((r) => r.id), ['r_setembro']);
  assert.deepEqual(getOutOfSeasonResults(estado).map((r) => r.id), ['r_setembro']);
}

// 10) A sugestão da próxima temporada herda a duração da que está sendo encerrada.
{
  const sugestao = suggestNextSeason(snapshot(), '2026-09-05');
  assert.equal(sugestao.start_date, '2026-09-01', 'começa no dia seguinte ao fim');
  assert.equal(sugestao.end_date, '2026-12-31', '4 meses, igual ao quadrimestre que fechou');
  assert.equal(sugestao.year, 2026);
}

// ---------------------------------------------------------------------------
// 11) Editar a temporada corrente: era o único jeito de escrever nome e datas
//     de temporada, e só existia dentro do encerramento — um dígito errado ali
//     só se consertava congelando outra temporada pela metade.
{
  const estado = snapshot();

  // Esticar o fim faz a rodada de setembro passar a contar. O impacto é
  // calculado ANTES, para a tela poder avisar.
  const impacto = seasonWindowChangeImpact(estado, { start: '2026-05-01', end: '2026-09-30' });
  assert.deepEqual(impacto.entering.map((r) => r.id), ['r_setembro']);
  assert.deepEqual(impacto.leaving, []);

  assert.equal(updateSeason(estado, { name: 'Inverno 26', start_date: '2026-05-01', end_date: '2026-09-30' }).ok, true);
  assert.equal(pontosDe(calculateCurrentRanking(estado), 'p_zeca'), 6, 'setembro passou a contar');
  assert.equal(estado.championship.active.id, 'inverno-2026', 'o id não muda — é a chave do congelado');

  // Encolher devolve a rodada para fora, sem apagar nada.
  const volta = seasonWindowChangeImpact(estado, { start: '2026-05-01', end: '2026-08-31' });
  assert.deepEqual(volta.leaving.map((r) => r.id), ['r_setembro']);
  updateSeason(estado, { name: 'Inverno 26', start_date: '2026-05-01', end_date: '2026-08-31' });
  assert.equal(estado.championship.active.results.length, 2, 'nenhuma rodada foi apagada');
  assert.deepEqual(getOutOfSeasonResults(estado).map((r) => r.id), ['r_setembro']);

  // O ano acompanha as datas novas (decide o título do anual e a virada de ano).
  updateSeason(estado, { name: 'Verão 27', start_date: '2027-01-01', end_date: '2027-04-30' });
  assert.equal(estado.championship.active.year, 2027);
}

// 12) As recusas: sem nome, fim antes do início, e invadir período congelado.
{
  const estado = snapshot();
  assert.equal(updateSeason(estado, { name: '  ' }).reason, 'name_required');
  assert.equal(updateSeason(estado, { name: 'X', start_date: '2026-05-01', end_date: '2026-04-01' }).reason, 'end_before_start');
  assert.equal(estado.championship.active.name, 'Inverno 26', 'recusa não pode ter mexido no estado');

  // Depois de encerrar, a temporada nova não pode voltar para dentro do
  // período congelado: a mesma rodada pontuaria duas vezes.
  const fechado = snapshot();
  closeSeason(fechado, {
    nextSeason: { name: 'Primavera 26', start_date: '2026-09-01', end_date: '2026-12-31', year: 2026 },
    ratingRows: votos,
    now: '2026-09-05T22:00:00.000Z',
  });
  const recusa = updateSeason(fechado, { name: 'Primavera 26', start_date: '2026-08-01', end_date: '2026-12-31' });
  assert.equal(recusa.ok, false);
  assert.equal(recusa.reason, 'overlaps_closed_season');
  assert.equal(recusa.limit, '2026-08-31');
  assert.equal(updateSeason(fechado, { name: 'Primavera 26', start_date: '2026-09-01', end_date: '2027-01-31' }).ok, true,
    'depois do fim congelado é livre');
}

console.log('ok — encerramento e edição de temporada');
