import { isCarneOnly, playsFootball as authzPlaysFootball } from '../../domain/authz.js';
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

const IMPORTED_SHEET_NAME_ALIASES = {
  // De/para validado com a planilha Inverno 26.
  'ADRIANO': 'DANO',
  'ANDRE DAMS': 'ANDRE',
  'ANDRÉ DAMS': 'ANDRE',
  'LUCAS SILVA': 'LUCAS',
  'DAVID': 'DVD',
  'GEDE': 'GEDIEL',
  'NATAN': 'NATAN',
  'PAPAI PH': 'PH',
  'WILLIAM': 'WILLIAM',
};

const IMPORTED_SHEET_STATUS_BY_POINTS = {
  0: 'no_play',
  1: 'loss',
  2: 'draw',
  3: 'win',
};

const IMPORTED_SHEET_ROUNDS = [
  {
    id: 'import_rei_da_quadra_2026_05_06',
    date: '2026-05-06',
    label: '06/05',
    source: 'Planilha Rei da Quadra',
    values: {
      'Júnior': 2,
      'Adriano': 2,
      'André Dams': 2,
      'Broquinha': 2,
      'Broca': 2,
      'Cauê': 2,
      'David': 2,
      'Dick': 2,
      'William': 2,
      'Niniu': 2,
      'Papai PH': 2,
      'Vinícius': 2,
      'Lucas Silva': 0,
      'Gui': 2,
      'Caetano': 2,
      'Natan': 0,
      'Digão': 2,
      'Mário': 2,
      'Panga': 2,
      'Samuel': 0,
      'Gede': 0,
      'Vítor': 0,
      'Telo': 0,
      'Trocinho': 0,
    },
  },
  {
    id: 'import_rei_da_quadra_2026_05_13',
    date: '2026-05-13',
    label: '13/05',
    source: 'Planilha Rei da Quadra',
    values: {
      'Júnior': 3,
      'Adriano': 3,
      'André Dams': 3,
      'Broquinha': 3,
      'Broca': 3,
      'Cauê': 3,
      'David': 3,
      'Dick': 3,
      'William': 1,
      'Niniu': 1,
      'Papai PH': 1,
      'Vinícius': 1,
      'Lucas Silva': 1,
      'Gui': 1,
      'Caetano': 1,
      'Natan': 3,
      'Digão': 0,
      'Mário': 0,
      'Panga': 0,
      'Samuel': 1,
      'Gede': 0,
      'Vítor': 0,
      'Telo': 0,
      'Trocinho': 0,
    },
  },
  {
    id: 'import_rei_da_quadra_2026_05_20',
    date: '2026-05-20',
    label: '20/05',
    source: 'Planilha Rei da Quadra',
    values: {
      'Júnior': 3,
      'Adriano': 3,
      'André Dams': 1,
      'Broquinha': 1,
      'Broca': 1,
      'Cauê': 1,
      'David': 1,
      'Dick': 1,
      'William': 3,
      'Niniu': 3,
      'Papai PH': 3,
      'Vinícius': 3,
      'Lucas Silva': 3,
      'Gui': 1,
      'Caetano': 1,
      'Natan': 0,
      'Digão': 0,
      'Mário': 0,
      'Panga': 0,
      'Samuel': 0,
      'Gede': 0,
      'Vítor': 0,
      'Telo': 0,
      'Trocinho': 0,
    },
  },
  {
    id: 'import_rei_da_quadra_2026_05_27',
    date: '2026-05-27',
    label: '27/05',
    source: 'Planilha Rei da Quadra',
    values: {
      'Júnior': 2,
      'Adriano': 2,
      'André Dams': 2,
      'Broquinha': 2,
      'Broca': 2,
      'Cauê': 2,
      'David': 2,
      'Dick': 2,
      'William': 2,
      'Niniu': 2,
      'Papai PH': 2,
      'Vinícius': 2,
      'Lucas Silva': 1,
      'Gui': 2,
      'Caetano': 0,
      'Natan': 2,
      'Digão': 2,
      'Mário': 0,
      'Panga': 0,
      'Samuel': 0,
      'Gede': 0,
      'Vítor': 0,
      'Telo': 2,
      'Trocinho': 0,
    },
  },
  {
    id: 'import_rei_da_quadra_2026_06_03',
    date: '2026-06-03',
    label: '03/06',
    source: 'Planilha Rei da Quadra',
    values: {
      'Júnior': 3,
      'Adriano': 1,
      'André Dams': 1,
      'Broquinha': 3,
      'Broca': 1,
      'Cauê': 0,
      'David': 3,
      'Dick': 3,
      'William': 3,
      'Niniu': 3,
      'Papai PH': 1,
      'Vinícius': 0,
      'Lucas Silva': 2,
      'Gui': 3,
      'Caetano': 1,
      'Natan': 0,
      'Digão': 3,
      'Mário': 0,
      'Panga': 0,
      'Samuel': 0,
      'Gede': 0,
      'Vítor': 0,
      'Telo': 1,
      'Trocinho': 0,
    },
  },
];

function normalizeImportedSheetName(value) {
  const normalized = normalizeName(value);
  return IMPORTED_SHEET_NAME_ALIASES[normalized] || normalized;
}

function getStatusFromImportedPoints(points) {
  return IMPORTED_SHEET_STATUS_BY_POINTS[Number(points)] || 'no_play';
}

function buildPlayerNameIndex(players) {
  const index = new Map();

  players.forEach((player) => {
    const normalized = normalizeName(player.name);
    if (normalized) index.set(normalized, player);
  });

  return index;
}

export function getImportedChampionshipResults(snapshot) {
  const players = getFootballPlayers(snapshot);
  const playerByName = buildPlayerNameIndex(players);

  return IMPORTED_SHEET_ROUNDS.map((round) => {
    const statuses = {};
    const audit_entries = [];

    Object.entries(round.values || {}).forEach(([sheetName, points]) => {
      const normalizedSheetName = normalizeImportedSheetName(sheetName);
      const player = playerByName.get(normalizedSheetName) || null;
      const status = getStatusFromImportedPoints(points);

      if (player?.id) {
        statuses[String(player.id)] = status;
      }

      audit_entries.push({
        sheet_name: sheetName,
        normalized_name: normalizedSheetName,
        app_name: player?.name || null,
        player_id: player?.id ? String(player.id) : null,
        status,
        points: Number(points || 0),
      });
    });

    return {
      id: round.id,
      date: round.date,
      created_at: round.date,
      outcome: 'imported_sheet',
      source: round.source,
      imported: true,
      team_a: [],
      team_b: [],
      statuses,
      audit_entries,
    };
  });
}

export function getEffectiveChampionshipResults(snapshot) {
  const imported = getImportedChampionshipResults(snapshot);
  const championship = getChampionshipState(snapshot);
  const importedIds = new Set(imported.map((result) => String(result.id)));

  return [
    ...imported,
    ...championship.active.results.filter((result) => !importedIds.has(String(result.id))),
  ].sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

export function getResultAuditRows(result, players) {
  const playerById = new Map((players || []).map((player) => [String(player.id), player]));

  if (Array.isArray(result.audit_entries)) {
    return result.audit_entries.map((entry) => ({
      player_id: entry.player_id || null,
      name: entry.app_name || entry.sheet_name || 'Jogador não vinculado',
      sheet_name: entry.sheet_name || '',
      status: entry.status || 'no_play',
      points: Number(entry.points || 0),
      matched: !!entry.player_id,
    }));
  }

  return (players || []).map((player) => {
    const status = result.statuses?.[String(player.id)] || 'no_play';
    return {
      player_id: String(player.id),
      name: player.name || 'Sem nome',
      sheet_name: '',
      status,
      points: POINTS_BY_STATUS[status] || 0,
      matched: true,
    };
  });
}



export function isFootballPlayer(player) {
  return !!player && authzPlaysFootball(player);
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
          draw_id: result.draw_id || null,
          game_key: result.game_key || null,
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
    draw_id: result.draw_id || null,
    game_key: result.game_key || null,
    team_a: Array.isArray(result.team_a) ? result.team_a.map(String) : [],
    team_b: Array.isArray(result.team_b) ? result.team_b.map(String) : [],
    statuses: result.statuses && typeof result.statuses === 'object' ? { ...result.statuses } : {},
  };

  const results = championship.active.results.filter((entry) => (
    String(entry.id) !== String(normalizedResult.id) &&
    String(entry.date) !== String(normalizedResult.date)
  ));
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


function normalizeDrawEntry(draw, fallbackId = '') {
  if (!draw || typeof draw !== 'object') return null;

  const teamA = Array.isArray(draw.team_a) ? draw.team_a.map(String).filter(Boolean) : [];
  const teamB = Array.isArray(draw.team_b) ? draw.team_b.map(String).filter(Boolean) : [];
  if (!teamA.length || !teamB.length) return null;

  const gameDate = draw.game_date || draw.date || '';
  const gameTime = draw.game_time || '';
  const createdAt = draw.created_at || null;
  const id = String(draw.id || fallbackId || `${gameDate}_${createdAt || Date.now()}`);

  return {
    ok: true,
    id,
    draw_id: id,
    game_key: draw.game_key || null,
    game_date: gameDate,
    game_time: gameTime,
    created_at: createdAt,
    total_players: Number(draw.total_players || teamA.length + teamB.length),
    team_a: teamA,
    team_b: teamB,
  };
}

export function getChampionshipDrawOptions(snapshot) {
  const game = snapshot?.game || {};
  const options = [];
  const pushDraw = (draw, fallbackId) => {
    const normalized = normalizeDrawEntry(draw, fallbackId);
    if (!normalized) return;
    if (options.some((entry) => String(entry.id) === String(normalized.id))) return;
    options.push(normalized);
  };

  pushDraw(game.sort_result, 'current_draw');
  (Array.isArray(game.draw_history) ? game.draw_history : []).forEach((draw, index) => pushDraw(draw, `draw_history_${index}`));

  return options.sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));
}

export function getActiveDrawTeams(snapshot, drawId = null) {
  const options = getChampionshipDrawOptions(snapshot);
  const selected = drawId
    ? options.find((draw) => String(draw.id) === String(drawId))
    : options[0];

  if (!selected) {
    return { ok: false, message: 'Faça o sorteio dos times antes de lançar o resultado do campeonato.' };
  }

  return selected;
}

export function buildTeamResultStatuses(snapshot, outcome, drawId = null) {
  const draw = getActiveDrawTeams(snapshot, drawId);
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
    draw_id: draw.id,
    game_key: draw.game_key || null,
    game_date: draw.game_date || null,
    game_time: draw.game_time || null,
    team_a: draw.team_a,
    team_b: draw.team_b,
    statuses,
  };
}

export function getTeamOutcomeLabel(outcome) {
  return TEAM_RESULT_OPTIONS.find((option) => option.value === outcome)?.label || 'Resultado lançado';
}

export function getManualChampionshipResults(snapshot) {
  return getChampionshipState(snapshot).active.results
    .filter((result) => !result.imported)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

export function calculateCurrentRanking(snapshot) {
  const players = getFootballPlayers(snapshot);
  const rowsById = new Map(players.map((player) => [String(player.id), buildEmptyRow(player)]));
  const results = getEffectiveChampionshipResults(snapshot);

  results.forEach((result) => {
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
