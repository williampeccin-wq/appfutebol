import { CHAMPIONSHIP_HISTORY } from './championship.history.js';

export const ACTIVE_CHAMPIONSHIP = {
  id: 'inverno-2026',
  name: 'Inverno 26',
  year: 2026,
  label: 'Inverno 2026',
  start_date: '2026-05-01',
  end_date: '2026-08-31',
};

export const RESULT_OPTIONS = [
  { value: 'no_play', label: 'Não jogou', points: 0 },
  { value: 'win', label: 'Vitória', points: 3 },
  { value: 'draw', label: 'Empate', points: 2 },
  { value: 'loss', label: 'Derrota', points: 1 },
];

export const TEAM_RESULT_OPTIONS = [
  { value: 'team_a', label: 'Time A venceu' },
  { value: 'draw', label: 'Empate' },
  { value: 'team_b', label: 'Time B venceu' },
];

const POINTS_BY_STATUS = RESULT_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.points;
  return acc;
}, {});

export function isFootballPlayer(player) {
  return !!player && player.plays_football !== false && player.role !== 'carne';
}

export function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function getFootballPlayers(snapshot) {
  return (Array.isArray(snapshot?.players) ? snapshot.players : [])
    .filter(isFootballPlayer)
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR'));
}

function makeChampionshipResultId() {
  if (globalThis.crypto?.randomUUID) return `championship_result_${globalThis.crypto.randomUUID()}`;
  return `championship_result_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getChampionshipState(snapshot) {
  const source = snapshot?.championship && typeof snapshot.championship === 'object'
    ? snapshot.championship
    : {};
  const active = source.active && typeof source.active === 'object' ? source.active : {};
  const rawResults = Array.isArray(active.results)
    ? active.results
    : Array.isArray(source.results)
      ? source.results
      : [];

  return {
    ...source,
    active: {
      id: active.id || ACTIVE_CHAMPIONSHIP.id,
      name: active.name || ACTIVE_CHAMPIONSHIP.name,
      year: active.year || ACTIVE_CHAMPIONSHIP.year,
      start_date: active.start_date || ACTIVE_CHAMPIONSHIP.start_date,
      end_date: active.end_date || ACTIVE_CHAMPIONSHIP.end_date,
      results: rawResults
        .filter((result) => result && typeof result === 'object')
        .map((result, index) => ({
          id: String(result.id || `championship_result_${index}`),
          date: String(result.date || ''),
          created_at: result.created_at || null,
          outcome: result.outcome || null,
          team_a: Array.isArray(result.team_a) ? result.team_a.map(String) : [],
          team_b: Array.isArray(result.team_b) ? result.team_b.map(String) : [],
          statuses: result.statuses && typeof result.statuses === 'object' ? { ...result.statuses } : {},
        }))
        .filter((result) => result.date)
        .sort((left, right) => String(left.date).localeCompare(String(right.date))),
    },
  };
}

export function persistChampionshipResult(snapshot, result) {
  const championship = getChampionshipState(snapshot);
  const normalizedResult = {
    id: String(result.id || makeChampionshipResultId()),
    date: String(result.date || ''),
    created_at: result.created_at || new Date().toISOString(),
    outcome: result.outcome || null,
    team_a: Array.isArray(result.team_a) ? result.team_a.map(String) : [],
    team_b: Array.isArray(result.team_b) ? result.team_b.map(String) : [],
    statuses: result.statuses && typeof result.statuses === 'object' ? { ...result.statuses } : {},
  };

  const results = championship.active.results.filter((entry) => String(entry.id) !== String(normalizedResult.id));
  results.push(normalizedResult);

  snapshot.championship = {
    ...championship,
    active: {
      ...championship.active,
      results: results.sort((left, right) => String(left.date).localeCompare(String(right.date))),
    },
  };
}

export function deleteChampionshipResult(snapshot, resultId) {
  const championship = getChampionshipState(snapshot);
  snapshot.championship = {
    ...championship,
    active: {
      ...championship.active,
      results: championship.active.results.filter((entry) => String(entry.id) !== String(resultId)),
    },
  };
}

function buildEmptyRow(player) {
  return {
    player_id: String(player.id),
    name: player.name || 'Sem nome',
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    no_play: 0,
    played: 0,
    rank: null,
  };
}

function compareRows(left, right) {
  return (
    right.points - left.points ||
    right.wins - left.wins ||
    right.draws - left.draws ||
    right.losses - left.losses ||
    String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR')
  );
}

function isSameScore(left, right) {
  return !!left && !!right &&
    left.points === right.points &&
    left.wins === right.wins &&
    left.draws === right.draws &&
    left.losses === right.losses;
}

function applyRanks(sortedRows) {
  let lastRank = 0;
  let lastComparable = null;

  return sortedRows.map((row, index) => {
    const rank = isSameScore(row, lastComparable) ? lastRank : index + 1;
    lastRank = rank;
    lastComparable = row;
    return { ...row, rank };
  });
}


export function getActiveDrawTeams(snapshot) {
  const sortResult = snapshot?.game?.sort_result;
  if (!sortResult || typeof sortResult !== 'object') {
    return { ok: false, message: 'Faça o sorteio dos times antes de lançar o resultado do campeonato.' };
  }

  const teamA = Array.isArray(sortResult.team_a) ? sortResult.team_a.map(String).filter(Boolean) : [];
  const teamB = Array.isArray(sortResult.team_b) ? sortResult.team_b.map(String).filter(Boolean) : [];

  if (!teamA.length || !teamB.length) {
    return { ok: false, message: 'O sorteio atual precisa ter jogadores nos dois times.' };
  }

  return {
    ok: true,
    created_at: sortResult.created_at || null,
    team_a: teamA,
    team_b: teamB,
  };
}

export function buildTeamResultStatuses(snapshot, outcome) {
  const draw = getActiveDrawTeams(snapshot);
  if (!draw.ok) return { ok: false, message: draw.message };

  const validOutcome = TEAM_RESULT_OPTIONS.some((option) => option.value === outcome) ? outcome : null;
  if (!validOutcome) return { ok: false, message: 'Informe se venceu o Time A, venceu o Time B ou se houve empate.' };

  const players = getFootballPlayers(snapshot);
  const statuses = Object.fromEntries(players.map((player) => [String(player.id), 'no_play']));

  const assignTeam = (ids, status) => {
    ids.forEach((playerId) => {
      if (Object.prototype.hasOwnProperty.call(statuses, String(playerId))) {
        statuses[String(playerId)] = status;
      }
    });
  };

  if (validOutcome === 'draw') {
    assignTeam(draw.team_a, 'draw');
    assignTeam(draw.team_b, 'draw');
  } else if (validOutcome === 'team_a') {
    assignTeam(draw.team_a, 'win');
    assignTeam(draw.team_b, 'loss');
  } else if (validOutcome === 'team_b') {
    assignTeam(draw.team_a, 'loss');
    assignTeam(draw.team_b, 'win');
  }

  return {
    ok: true,
    outcome: validOutcome,
    team_a: draw.team_a,
    team_b: draw.team_b,
    statuses,
  };
}

export function getTeamOutcomeLabel(outcome) {
  return TEAM_RESULT_OPTIONS.find((option) => option.value === outcome)?.label || 'Resultado lançado';
}

export function calculateCurrentRanking(snapshot) {
  const players = getFootballPlayers(snapshot);
  const rowsById = new Map(players.map((player) => [String(player.id), buildEmptyRow(player)]));
  const championship = getChampionshipState(snapshot);

  championship.active.results.forEach((result) => {
    rowsById.forEach((row, playerId) => {
      const rawStatus = result.statuses?.[playerId] || 'no_play';
      const status = Object.prototype.hasOwnProperty.call(POINTS_BY_STATUS, rawStatus) ? rawStatus : 'no_play';
      row.points += POINTS_BY_STATUS[status] || 0;

      if (status === 'win') row.wins += 1;
      if (status === 'draw') row.draws += 1;
      if (status === 'loss') row.losses += 1;
      if (status === 'no_play') row.no_play += 1;
      if (status !== 'no_play') row.played += 1;
    });
  });

  return applyRanks([...rowsById.values()].sort(compareRows));
}

export function getResultSummary(result, players) {
  const ids = new Set(players.map((player) => String(player.id)));
  const counters = { win: 0, draw: 0, loss: 0, no_play: 0 };
  Object.entries(result.statuses || {}).forEach(([playerId, status]) => {
    if (!ids.has(String(playerId))) return;
    if (Object.prototype.hasOwnProperty.call(counters, status)) counters[status] += 1;
  });
  return counters;
}

export function getHistoricalTournaments() {
  return (CHAMPIONSHIP_HISTORY.tournaments || [])
    .filter((tournament) => tournament.name !== ACTIVE_CHAMPIONSHIP.name)
    .map((tournament) => ({
      ...tournament,
      rows: (tournament.rows || []).map((row, index) => ({
        rank: row.rank || index + 1,
        name: row.name,
        points: Number(row.points || 0),
        wins: Number(row.wins || 0),
        draws: Number(row.draws || 0),
        losses: Number(row.losses || 0),
        wo: Number(row.wo || 0),
      })),
    }));
}

export function getHistoricalAnnual() {
  return (CHAMPIONSHIP_HISTORY.annual || []).map((annual) => ({
    ...annual,
    rows: (annual.rows || []).map((row, index) => ({
      rank: index + 1,
      name: row.name,
      points: Number(row.points || 0),
    })),
  }));
}

function historicalTournamentPointsByName(tournamentName) {
  const tournament = (CHAMPIONSHIP_HISTORY.tournaments || []).find((item) => item.name === tournamentName);
  const points = new Map();
  (tournament?.rows || []).forEach((row) => {
    points.set(normalizeName(row.name), Number(row.points || 0));
  });
  return points;
}

export function calculateAnnualRanking(snapshot) {
  const currentRanking = calculateCurrentRanking(snapshot);
  const abertura26 = historicalTournamentPointsByName('Abertura 26');
  const rows = currentRanking.map((row) => ({
    player_id: row.player_id,
    name: row.name,
    points: row.points + (abertura26.get(normalizeName(row.name)) || 0),
    current_points: row.points,
    abertura_points: abertura26.get(normalizeName(row.name)) || 0,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
  }));

  return applyRanks(rows.sort(compareRows));
}

export function getActiveChampionshipMeta(snapshot) {
  const championship = getChampionshipState(snapshot);
  return {
    ...ACTIVE_CHAMPIONSHIP,
    ...championship.active,
    ranking: calculateCurrentRanking(snapshot),
  };
}
