// Regressão dos defeitos de pontuação encontrados na varredura de 23/07/2026.
//
// 1) A rede de segurança de remoção (buildRemovedByGameKey) zerava os pontos de
//    quem tinha confirmação cancelada no jogo, MESMO quando o admin havia
//    declarado explicitamente que a pessoa jogou em "Ajustar quem jogou". O caso
//    real: alguém desiste em cima da hora, um substituto que já havia cancelado
//    entra em campo — e o app zerava os pontos dele em silêncio.
//
// 2) Gravar um resultado substituía outro da mesma rodada sem avisar. A
//    substituição continua existindo (é o comportamento desejado), mas agora é
//    detectável ANTES, para a UI poder perguntar.
//
// Rodar: node tests/campeonato-pontuacao.regression.mjs

import assert from 'node:assert/strict';
import {
  buildTeamResultStatuses,
  calculateCurrentRanking,
  findReplacedChampionshipResult,
  persistChampionshipResult,
} from '../appfutebol_run/js/modules/championship/championship.service.js';

// Nomes deliberadamente fora da planilha importada do Harmonia: enquanto
// IMPORTED_SHEET_ROUNDS for global (ver task de isolar o histórico por clube),
// um jogador de teste chamado "Junior" herda 13 pontos de outro clube só pelo
// nome — foi o que este teste flagrou ao ser escrito.
const GAME_KEY = 'game_2026-07-15_2030';
const DRAW_ID = 'draw_game_2026-07-15_2030_1';

// Tonho desistiu em cima da hora (confirmação cancelada) e Bibi entrou no
// lugar — mas Bibi também havia cancelado antes, e voltou atrás.
const snapshot = () => ({
  players: [
    { id: 'p_zeca', name: 'Zeca', plays_football: true, active: true },
    { id: 'p_tonho', name: 'Tonho', plays_football: true, active: true },
    { id: 'p_bibi', name: 'Bibi', plays_football: true, active: true },
    { id: 'p_nando', name: 'Nando', plays_football: true, active: true },
  ],
  confirmations: [
    { game_key: GAME_KEY, player_id: 'p_zeca', confirmed: true, status: 'confirmed' },
    { game_key: GAME_KEY, player_id: 'p_nando', confirmed: true, status: 'confirmed' },
    { game_key: GAME_KEY, player_id: 'p_tonho', confirmed: false, status: 'cancelled' },
    { game_key: GAME_KEY, player_id: 'p_bibi', confirmed: false, status: 'cancelled' },
  ],
  games: [{
    game_key: GAME_KEY,
    game_date: '2026-07-15',
    sort_result: {
      id: DRAW_ID,
      game_key: GAME_KEY,
      game_date: '2026-07-15',
      created_at: '2026-07-15T20:00:00.000Z',
      team_a: ['p_zeca', 'p_tonho'],
      team_b: ['p_nando'],
    },
  }],
  championship: { active: { id: 'inverno-2026', results: [] } },
});

const pontosDe = (ranking, id) => ranking.find((row) => row.player_id === id)?.points ?? null;

// ---------------------------------------------------------------- cenário 1
// O admin ajusta: Tonho não jogou, Bibi entrou no Time A. Time A venceu.

const s1 = snapshot();
const ajuste = { p_zeca: 'a', p_bibi: 'a', p_tonho: 'out', p_nando: 'b' };
const built = buildTeamResultStatuses(s1, 'team_a', DRAW_ID, ajuste);

assert.equal(built.ok, true, 'o lançamento com ajuste deveria ser válido');
assert.equal(built.lineup_adjusted, true, 'o resultado precisa registrar que a escalação foi ajustada');
assert.equal(built.game_key, GAME_KEY, 'o resultado tem de carregar o jogo de origem');

persistChampionshipResult(s1, {
  id: 'r_15_07',
  date: '2026-07-15',
  outcome: built.outcome,
  draw_id: built.draw_id,
  game_key: built.game_key,
  team_a: built.team_a,
  team_b: built.team_b,
  statuses: built.statuses,
  lineup_adjusted: built.lineup_adjusted,
});

const ranking1 = calculateCurrentRanking(s1);

// O ponto central: Bibi tinha confirmação CANCELADA e ainda assim o admin
// declarou que ele jogou. A declaração manda.
assert.equal(pontosDe(ranking1, 'p_bibi'), 3, 'Bibi jogou pelo Time A vencedor: 3 pontos, mesmo tendo cancelado antes');
assert.equal(pontosDe(ranking1, 'p_zeca'), 3, 'Zeca jogou pelo Time A vencedor: 3 pontos');
assert.equal(pontosDe(ranking1, 'p_nando'), 1, 'Nando jogou pelo Time B derrotado: 1 ponto');
assert.equal(pontosDe(ranking1, 'p_tonho'), 0, 'Tonho desistiu: 0 ponto');

// ---------------------------------------------------------------- cenário 2
// Sem ajuste manual, a rede de segurança continua valendo: quem foi removido
// do jogo por admin não pontua, mesmo constando no sorteio.

const s2 = snapshot();
s2.confirmations = s2.confirmations.map((c) => (
  c.player_id === 'p_tonho' ? { ...c, status: 'removed', removed_by_admin: true } : c
));
const semAjuste = buildTeamResultStatuses(s2, 'team_a', DRAW_ID, null);

assert.equal(semAjuste.lineup_adjusted, false, 'sem ajuste, a flag não pode ficar ligada');

persistChampionshipResult(s2, {
  id: 'r_15_07_b',
  date: '2026-07-15',
  outcome: semAjuste.outcome,
  draw_id: semAjuste.draw_id,
  game_key: semAjuste.game_key,
  team_a: semAjuste.team_a,
  team_b: semAjuste.team_b,
  statuses: semAjuste.statuses,
  lineup_adjusted: semAjuste.lineup_adjusted,
});

assert.equal(
  pontosDe(calculateCurrentRanking(s2), 'p_tonho'), 0,
  'sem ajuste manual, a rede de segurança segue zerando quem o admin removeu do jogo',
);

// ---------------------------------------------------------------- cenário 3
// Substituição da mesma rodada: detectável antes, e sem duplicar.

const s3 = snapshot();
persistChampionshipResult(s3, {
  id: 'r_primeiro', date: '2026-07-15', outcome: 'team_a',
  game_key: GAME_KEY, team_a: ['p_zeca'], team_b: ['p_nando'], statuses: {},
});

const substituido = findReplacedChampionshipResult(s3, { date: '2026-07-15', game_key: GAME_KEY });
assert.equal(substituido?.id, 'r_primeiro', 'a UI precisa saber QUAL resultado será substituído, para poder perguntar');

// Mesmo jogo, data corrigida: substitui em vez de duplicar a rodada.
const porJogo = findReplacedChampionshipResult(s3, { date: '2026-07-16', game_key: GAME_KEY });
assert.equal(porJogo?.id, 'r_primeiro', 'relançar o mesmo jogo com a data corrigida tem de substituir, não duplicar');

// Rodada de outro dia e outro jogo: nada é substituído.
const semConflito = findReplacedChampionshipResult(s3, { date: '2026-07-22', game_key: 'game_2026-07-22_2030' });
assert.equal(semConflito, null, 'uma rodada nova não pode reportar substituição');

persistChampionshipResult(s3, {
  id: 'r_segundo', date: '2026-07-15', outcome: 'team_b',
  game_key: GAME_KEY, team_a: ['p_zeca'], team_b: ['p_nando'], statuses: {},
});
const manuais = s3.championship.active.results.filter((r) => !r.imported);
assert.equal(manuais.length, 1, 'a rodada não pode ficar duplicada depois da substituição');
assert.equal(manuais[0].id, 'r_segundo', 'o resultado novo é o que vale');

console.log('OK — 14 asserções em 3 cenários. A declaração do admin vence a heurística; substituição é detectável antes.');
