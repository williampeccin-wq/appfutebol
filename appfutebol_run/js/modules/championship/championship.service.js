import { isCarneOnly, playsFootball as authzPlaysFootball } from '../../domain/authz.js';
import { CHAMPIONSHIP_HISTORY } from './championship.history.js';
import { getChampionshipLegacyDataset, getChampionshipPoints, getChampionshipSeason } from '../../domain/club-profile.js';

// Identificador do único dataset histórico existente hoje (a planilha Rei da
// Quadra do Harmonia). Um clube só enxerga estes dados se o PERFIL dele apontar
// explicitamente para cá — ver domain/club-profile.js.
const LEGACY_DATASET_ID = 'harmonia_rei_da_quadra';

// Este clube usa o dataset histórico do Harmonia?
function usesLegacyDataset(snapshot) {
  return getChampionshipLegacyDataset(snapshot) === LEGACY_DATASET_ID;
}

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

// Fallback: usado quando não há snapshot em mãos. A fonte real é o perfil.
const POINTS_BY_STATUS = RESULT_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.points;
  return acc;
}, {});

// Pontuação do clube. 3/2/1/0 é só o default — o perfil pode mudar.
function pointsTableFor(snapshot) {
  const p = getChampionshipPoints(snapshot);
  return { win: p.win, draw: p.draw, loss: p.loss, no_play: p.no_play };
}

const IMPORTED_SHEET_NAME_ALIASES = {
  // De/para validado com a planilha Inverno 26.
  // ATENÇÃO: o alvo é o NOME DE EXIBIÇÃO ATUAL do jogador. Se alguém for
  // renomeado no app, o alias quebra em silêncio e a pessoa deixa de pontuar nas
  // rodadas importadas (foi o que aconteceu com Vinicius/Lucas/Samuel — os
  // alvos antigos "Vinicius amigo Caue"/"Lucas Neto" não existiam mais).
  'ADRIANO': 'DANO',
  'CAUE': 'S2CANSADO',
  'VINICIUS': 'VINICIUS CAUE',   // era 'VINICIUS AMIGO CAUE' (renomeado); confirmado admin 23/07
  'ANDRE DAMS': 'ANDRE',
  'ANDRÉ DAMS': 'ANDRE',
  'LUCAS SILVA': 'LUKINHA',      // era 'LUCAS NETO' (renomeado p/ Lukinha😎, mesmo fone); o emoji é removido pelo normalizeName; confirmado admin 23/07
  'DAVID': 'DVD',
  'GEDE': 'GEDIEL',
  'NATAN': 'NATAN',
  'PAPAI PH': 'PH',
  'SAMUEL': 'SAMUEL REIS',       // renomeado de 'Samuel'; confirmado admin 23/07
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
      'Lucas Silva': 2,
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
      'Lucas Silva': 1,
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
      // Jogou em 03/06 mas ficou de fora da planilha importada (por isso nunca
      // pontuou nessa rodada). Confirmado pelo admin em 23/07/2026. 3 = vitória.
      'Robson': 3,
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
  // Sem opt-in explícito, nenhum clube herda as rodadas de outro. O casamento
  // aqui é por NOME normalizado: sem esta porta, um jogador chamado "Junior"
  // num clube novo receberia os pontos do Junior do Harmonia.
  if (!usesLegacyDataset(snapshot)) return [];

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
    .replace(/[\u0300-\u036f]/g, '')      // remove acentos
    // Remove emojis/pictogramas: um jogador com emoji no nome (ex.: "Lukinha\ud83d\ude0e")
    // n\u00e3o casava com a planilha importada porque o emoji sobrevivia \u00e0
    // normaliza\u00e7\u00e3o. Como isto roda nos DOIS lados da compara\u00e7\u00e3o, tirar n\u00e3o
    // quebra nenhum casamento existente e conserta os nomes com emoji.
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}]/gu, '')
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
  const temporada = getChampionshipSeason(snapshot);
  const rawResults = Array.isArray(active.results)
    ? active.results
    : Array.isArray(source.results)
      ? source.results
      : [];

  return {
    ...source,
    // O fallback vem da TEMPORADA DO CLUBE, não da constante do Harmonia. Antes
    // um clube novo abria o campeonato como "Inverno 2026 · 01/05 até 31/08" —
    // o calendário de outro grupo, que ele nunca definiu.
    active: {
      id: active.id || temporada.id,
      name: active.name || temporada.name,
      year: active.year || temporada.year,
      start_date: active.start_date || temporada.start_date,
      end_date: active.end_date || temporada.end_date,
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
          lineup_adjusted: result.lineup_adjusted === true,
        }))
        .filter((result) => result.date)
        .sort((left, right) => String(left.date).localeCompare(String(right.date))),
    },
  };
}

// Duas entradas são a MESMA rodada quando têm o mesmo id, quando são do mesmo
// jogo (game_key), ou quando caem na mesma data. Gravar uma substitui a outra.
//
// O game_key entrou aqui porque relançar o mesmo jogo com a data corrigida
// criava uma rodada duplicada em vez de corrigir a existente. A data continua
// valendo para as rodadas antigas, que não têm game_key.
function isSameRound(entry, candidate) {
  if (String(entry?.id || '') === String(candidate?.id || '')) return true;
  const entryGame = String(entry?.game_key || '');
  const candidateGame = String(candidate?.game_key || '');
  if (entryGame && candidateGame && entryGame === candidateGame) return true;
  return String(entry?.date || '') === String(candidate?.date || '');
}

// Qual resultado JÁ LANÇADO seria substituído por este. A UI usa isto para
// perguntar antes — a substituição era silenciosa, e um lançamento apagava
// outro sem que ninguém percebesse (INCIDENTE 23/07).
export function findReplacedChampionshipResult(snapshot, candidate) {
  return getChampionshipState(snapshot).active.results
    .find((entry) => !entry.imported && isSameRound(entry, candidate)) || null;
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
    lineup_adjusted: result.lineup_adjusted === true,
  };

  const results = championship.active.results.filter((entry) => !isSameRound(entry, normalizedResult));
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

// Sorteios disponíveis para lançar resultado. Varre TODOS os jogos, não só o
// ativo: cada jogo guarda o próprio `sort_result`/`draw_history`, e ler apenas
// o ativo fazia o resultado do jogo ANTERIOR virar inalcançável assim que um
// novo jogo era aberto (o novo nasce sem sorteio → lista vazia → o app dizia
// "faça o sorteio antes de lançar o resultado"). Como a abertura do próximo
// jogo é automática (cron `auto-open-games`, 2 dias antes), a janela para
// lançar fechava sozinha toda semana — foi o que deixou 15/07 e 22/07 sem
// resultado no campeonato. A ordenação por created_at desc é preservada, então
// o caso normal continua trazendo o sorteio mais recente primeiro.
export function getChampionshipDrawOptions(snapshot) {
  const options = [];
  const pushDraw = (draw, fallbackId) => {
    const normalized = normalizeDrawEntry(draw, fallbackId);
    if (!normalized) return;
    if (options.some((entry) => String(entry.id) === String(normalized.id))) return;
    options.push(normalized);
  };

  const collectFrom = (game, prefix) => {
    if (!game || typeof game !== 'object') return;
    pushDraw(game.sort_result, `${prefix}_draw`);
    (Array.isArray(game.draw_history) ? game.draw_history : [])
      .forEach((draw, index) => pushDraw(draw, `${prefix}_history_${index}`));
  };

  // O ativo primeiro (mantém os ids de fallback históricos p/ não invalidar
  // resultados já lançados que referenciam 'current_draw'/'draw_history_N').
  const active = snapshot?.game || {};
  pushDraw(active.sort_result, 'current_draw');
  (Array.isArray(active.draw_history) ? active.draw_history : []).forEach((draw, index) => pushDraw(draw, `draw_history_${index}`));

  // Depois todos os demais jogos do histórico.
  const games = Array.isArray(snapshot?.games) ? snapshot.games : [];
  games.forEach((game) => collectFrom(game, String(game?.game_key || game?.id || game?.game_date || 'game')));

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

// Escalação REAL do jogo, a partir do sorteio: { playerId: 'a' | 'b' }.
// Convidado / goleiro alugado não entram — o sorteio embute o objeto do jogador
// (sem id persistente) e o campeonato só pontua jogador registrado.
export function buildLineupFromDraw(draw) {
  const map = {};
  const add = (arr, side) => (Array.isArray(arr) ? arr : []).forEach((v) => {
    if (typeof v === 'string' || typeof v === 'number') map[String(v)] = side;
  });
  add(draw?.team_a, 'a');
  add(draw?.team_b, 'b');
  return map;
}

// `lineup` permite corrigir o que o sorteio não sabe: quem desistiu em cima da
// hora, quem entrou no lugar, quem saiu no meio. Sem ele, vale o sorteio.
// Formato: { playerId: 'a' | 'b' | 'out' } — 'out' (ou ausente) = não jogou.
export function buildTeamResultStatuses(snapshot, outcome, drawId = null, lineup = null) {
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

  // A escalação ajustada manda; sem ajuste, vale o sorteio. Só entram ids que
  // são jogador registrado — convidado/goleiro alugado não pontuam (o sorteio
  // embute o objeto do jogador, sem id persistente, e String(obj) virava
  // "[object Object]" no registro antigo).
  const lineupAdjusted = !!(lineup && typeof lineup === 'object' && Object.keys(lineup).length);
  const map = lineupAdjusted ? lineup : buildLineupFromDraw(draw);
  const isPlayer = (id) => Object.prototype.hasOwnProperty.call(statuses, String(id));
  const teamA = Object.keys(map).filter((id) => map[id] === 'a' && isPlayer(id));
  const teamB = Object.keys(map).filter((id) => map[id] === 'b' && isPlayer(id));

  if (!teamA.length && !teamB.length) {
    return { ok: false, message: 'Nenhum jogador registrado na escalação. Ajuste quem jogou antes de lançar.' };
  }

  if (validOutcome === 'draw') {
    assignTeam(teamA, 'draw');
    assignTeam(teamB, 'draw');
  } else if (validOutcome === 'team_a') {
    assignTeam(teamA, 'win');
    assignTeam(teamB, 'loss');
  } else if (validOutcome === 'team_b') {
    assignTeam(teamA, 'loss');
    assignTeam(teamB, 'win');
  }

  return {
    ok: true,
    outcome: validOutcome,
    draw_id: draw.id,
    game_key: draw.game_key || null,
    game_date: draw.game_date || null,
    game_time: draw.game_time || null,
    team_a: teamA,
    team_b: teamB,
    statuses,
    // Marca que o admin declarou explicitamente quem jogou. A classificação usa
    // isto para NÃO deixar a heurística de remoção sobrescrever a declaração.
    lineup_adjusted: lineupAdjusted,
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

// Mapa game_key -> jogadores removidos do jogo por admin. Quem foi removido da
// escalação não pontua naquele jogo, mesmo que um resultado já tenha sido
// lançado antes da remoção (rede de segurança para dados já gravados).
export function buildRemovedByGameKey(snapshot) {
  const map = new Map();
  (Array.isArray(snapshot?.confirmations) ? snapshot.confirmations : []).forEach((entry) => {
    if (!entry || entry.confirmed === true) return;
    const out = entry.removed_by_admin === true || entry.status === 'removed' || entry.status === 'cancelled';
    if (!out) return;
    const key = String(entry.game_key || '');
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(String(entry.player_id));
  });
  return map;
}

export function calculateCurrentRanking(snapshot) {
  const players = getFootballPlayers(snapshot);
  const rowsById = new Map(players.map((player) => [String(player.id), buildEmptyRow(player)]));
  const results = getEffectiveChampionshipResults(snapshot);
  const removedByGameKey = buildRemovedByGameKey(snapshot);
  const pontos = pointsTableFor(snapshot);   // 3/2/1/0 é default, não regra fixa

  results.forEach((result) => {
    const gameKey = String(result.game_key || '');
    // A rede de segurança existe para resultados lançados ANTES de o admin
    // remover alguém da escalação — dados já gravados que ninguém revisou.
    // Quando o admin declarou explicitamente quem jogou ("Ajustar quem jogou"),
    // a declaração dele é a verdade: sem esta ressalva, um substituto que havia
    // cancelado e acabou entrando em campo tinha os pontos zerados em silêncio,
    // exatamente o caso que motivou o editor de escalação.
    const removedSet = (gameKey && result.lineup_adjusted !== true) ? removedByGameKey.get(gameKey) : null;
    rowsById.forEach((row, playerId) => {
      const rawStatus = (removedSet && removedSet.has(playerId)) ? 'no_play' : (result.statuses?.[playerId] || 'no_play');
      const status = Object.prototype.hasOwnProperty.call(pontos, rawStatus) ? rawStatus : 'no_play';
      row.points += pontos[status] || 0;

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

export function getHistoricalTournaments(snapshot = null) {
  if (snapshot && !usesLegacyDataset(snapshot)) return [];
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

export function getHistoricalAnnual(snapshot = null) {
  if (snapshot && !usesLegacyDataset(snapshot)) return [];
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
  // Idem: somar por nome vazaria pontos de outro clube — e este ranking
  // alimenta o índice de força do sorteio, então o estrago passaria dos pontos
  // para a divisão dos times.
  const abertura26 = usesLegacyDataset(snapshot)
    ? historicalTournamentPointsByName('Abertura 26')
    : new Map();
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
    ...getChampionshipSeason(snapshot),
    ...championship.active,
    ranking: calculateCurrentRanking(snapshot),
  };
}
