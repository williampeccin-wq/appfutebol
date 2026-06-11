import { isCarneOnly, playsFootball as authzPlaysFootball } from '../../domain/authz.js';
import { getState, patchState } from '../../core/state.js';
import { getPresenceDecision, isGameFull, isGoalkeeperEntry } from '../../domain/rules.engine.js';
import { getActiveGame, getGameKey } from '../../domain/projection.js';


function activeGame(snapshot = getState()) { return getActiveGame(snapshot); }
function activeGameKey(snapshot = getState()) { return getGameKey(activeGame(snapshot)); }
function scopedConfirmations(snapshot = getState()) {
  const key = activeGameKey(snapshot);
  return (snapshot.confirmations || []).filter((entry) => String(entry?.game_key || '') === key);
}
function mergeScopedConfirmations(snapshot, scoped) {
  const key = activeGameKey(snapshot);
  const others = (snapshot.confirmations || []).filter((entry) => String(entry?.game_key || '') !== key);
  return [...others, ...scoped.map((entry) => ({ ...entry, game_key: key }))];
}
function patchScopedConfirmations(snapshot, scoped) { patchState({ confirmations: mergeScopedConfirmations(snapshot, scoped) }); }

function isGoalkeeperPlayer(player) {
  const raw = String(player?.position || '').trim().toLowerCase();
  return raw === 'gol' || raw === 'goleiro';
}

function getConfirmedGoalkeeperCount(confirmations = [], players = []) {
  const playersById = new Map((players || []).map((player) => [String(player.id), player]));
  return (Array.isArray(confirmations) ? confirmations : [])
    .filter((entry) => entry?.confirmed)
    .filter((entry) => isGoalkeeperEntry(entry) || isGoalkeeperPlayer(playersById.get(String(entry.player_id))))
    .length;
}

function normalizeGoalkeeperConfirmation(entry, player) {
  if (!isGoalkeeperPlayer(player)) return entry;
  return {
    ...entry,
    goalkeeper: true,
    segment: 'goalkeeper',
    presence_role: 'goalkeeper',
  };
}

function normalizeConfirmationSegments(confirmations = [], players = []) {
  const playersById = new Map((players || []).map((player) => [String(player.id), player]));
  return (Array.isArray(confirmations) ? confirmations : []).map((entry) => (
    normalizeGoalkeeperConfirmation(entry, playersById.get(String(entry?.player_id)))
  ));
}

function getLineConfirmedCount(confirmations = [], players = []) {
  const normalized = normalizeConfirmationSegments(confirmations, players);
  return normalized.filter((entry) => entry?.confirmed && !isGoalkeeperEntry(entry)).length;
}


function patchActiveGame(snapshot, updatedGame) {
  const key = activeGameKey(snapshot);
  patchState({
    game: updatedGame,
    games: (snapshot.games || []).map((item) => String(item.game_key || item.id) === key ? updatedGame : item),
  });
}

function patchForActiveGame(snapshot, updatedGame) {
  const key = activeGameKey(snapshot);
  return {
    game: updatedGame,
    games: (snapshot.games || []).map((item) => String(item.game_key || item.id) === key ? updatedGame : item),
  };
}

function buildDrawRemovalPatch(snapshot, playerId, now = new Date().toISOString()) {
  const game = activeGame(snapshot);
  const sortResult = game?.sort_result;

  if (!sortResult) {
    return {};
  }

  const targetId = String(playerId);
  const getEntryId = (entry) => (entry && typeof entry === 'object') ? entry.id : entry;
  const removeFromTeam = (team) => (
    Array.isArray(team)
      ? team.filter((entry) => String(getEntryId(entry)) !== targetId)
      : []
  );

  const adjustedDraw = {
    ...sortResult,
    team_a: removeFromTeam(sortResult.team_a),
    team_b: removeFromTeam(sortResult.team_b),
    adjusted_at: now,
  };

  const drawHistory = Array.isArray(game.draw_history) ? game.draw_history : [];
  const updatedGame = {
    ...game,
    sort_result: adjustedDraw,
    draw_history: drawHistory.map((entry) => (
      String(entry?.id || '') === String(sortResult.id || '') ? adjustedDraw : entry
    )),
  };

  return patchForActiveGame(snapshot, updatedGame);
}

function clearActiveDrawFromGame(game = {}) {
  return {
    ...game,
    sort_result: null,
  };
}

function clearActiveDraw(snapshot = getState()) {
  const game = activeGame(snapshot);
  patchActiveGame(snapshot, clearActiveDrawFromGame(game));
}

function getRentalGoalkeepers(game = activeGame()) {
  return Array.isArray(game?.rental_goalkeepers) ? game.rental_goalkeepers : [];
}

export function addRentalGoalkeeper(name = '') {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const current = getRentalGoalkeepers(game);
  const cleanName = String(name || '').trim() || `Goleiro de aluguel ${current.length + 1}`;

  if (current.length >= 2) {
    return { ok: false, message: 'Limite de 2 goleiros atingido.' };
  }

  const entry = {
    id: `rental_goalkeeper_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: cleanName,
    temporary: true,
    created_at: new Date().toISOString(),
  };

  patchActiveGame(snapshot, {
    ...game,
    rental_goalkeepers: [...current, entry].slice(0, 2),
  });

  return { ok: true, message: `${cleanName} adicionado como goleiro.`, goalkeeper: entry };
}

export function removeRentalGoalkeeper(id) {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const current = getRentalGoalkeepers(game);
  const next = current.filter((entry) => String(entry.id) !== String(id));

  patchActiveGame(snapshot, {
    ...game,
    rental_goalkeepers: next,
  });

  return { ok: true, message: 'Goleiro de aluguel removido.' };
}


export function hasCapacity() {
  const snapshot = getState();
  const confirmations = normalizeConfirmationSegments(scopedConfirmations(snapshot), snapshot.players || []);
  return !isGameFull(activeGame(snapshot), confirmations);
}

export function isConfirmed(playerId) {
  const snapshot = getState();
  return scopedConfirmations(snapshot).some((item) => item.player_id === playerId && item.confirmed);
}

export function getPresenceGuard(player, game) {
  const snapshot = getState();
  const confirmations = normalizeConfirmationSegments(scopedConfirmations(snapshot), snapshot.players || []);
  const decision = getPresenceDecision({
    player,
    game: activeGame(snapshot),
    confirmations,
  });

  return {
    ok: decision.canConfirm || decision.canCancel,
    message: decision.message,
    decision,
  };
}


export function canManagePresence(player, game) {
  return getPresenceGuard(player, game);
}


function isWaitlistEntry(entry) {
  return !!entry && entry.confirmed !== true && (entry.status === 'waitlist' || entry.status === 'waitlisted');
}

function getWaitlistEntries(confirmations = []) {
  return (Array.isArray(confirmations) ? confirmations : [])
    .filter(isWaitlistEntry)
    .sort((a, b) => String(a.waitlisted_at || a.timestamp || '').localeCompare(String(b.waitlisted_at || b.timestamp || '')));
}

function promoteFirstWaitlisted(confirmations = [], now = new Date().toISOString(), excludedPlayerId = null) {
  const waitlist = getWaitlistEntries(confirmations)
    .filter((entry) => String(entry.player_id) !== String(excludedPlayerId || ''));

  if (!waitlist.length) {
    return {
      confirmations,
      promoted: null,
    };
  }

  const promotedId = String(waitlist[0].player_id);

  return {
    promoted: promotedId,
    confirmations: confirmations.map((entry) => (
      String(entry.player_id) === promotedId
        ? {
            ...entry,
            confirmed: true,
            status: 'confirmed',
            waitlisted_at: null,
            waitlist_position: null,
            removed_by_admin: false,
            confirmed_at: now,
            cancelled_at: null,
            timestamp: now,
          }
        : entry
    )),
  };
}

function upsertWaitlistEntry(snapshot, playerId, now = new Date().toISOString()) {
  const currentWaitlist = getWaitlistEntries(snapshot.confirmations);
  const existing = (snapshot.confirmations || []).find((entry) => String(entry.player_id) === String(playerId));

  const waitlistEntry = {
    ...(existing || {}),
    player_id: playerId,
    confirmed: false,
    status: 'waitlist',
    removed_by_admin: false,
    confirmed_at: null,
    cancelled_at: null,
    waitlisted_at: existing?.waitlisted_at || now,
    waitlist_position: currentWaitlist.some((entry) => String(entry.player_id) === String(playerId))
      ? currentWaitlist.findIndex((entry) => String(entry.player_id) === String(playerId)) + 1
      : currentWaitlist.length + 1,
    timestamp: now,
  };

  if (existing) {
    return (snapshot.confirmations || []).map((entry) => (
      String(entry.player_id) === String(playerId) ? waitlistEntry : entry
    ));
  }

  return [
    ...(snapshot.confirmations || []),
    waitlistEntry,
  ];
}

function normalizeWaitlistPositions(confirmations = []) {
  const waitlistIds = getWaitlistEntries(confirmations).map((entry) => String(entry.player_id));
  return confirmations.map((entry) => {
    if (!isWaitlistEntry(entry)) return entry;
    const position = waitlistIds.indexOf(String(entry.player_id)) + 1;
    return {
      ...entry,
      waitlist_position: position > 0 ? position : null,
    };
  });
}

export function getWaitlistView(snapshot = getState()) {
  const playersById = new Map((snapshot.players || []).map((player) => [String(player.id), player]));
  return getWaitlistEntries(scopedConfirmations(snapshot))
    .map((entry, index) => ({
      ...entry,
      position: index + 1,
      player: playersById.get(String(entry.player_id)) || null,
    }))
    .filter((entry) => entry.player);
}


export function toggleConfirmation(playerId) {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const gameKey = activeGameKey(snapshot);
  const confirmations = scopedConfirmations(snapshot);
  const capacityConfirmations = normalizeConfirmationSegments(confirmations, snapshot.players || []);
  const player = snapshot.players.find((item) => String(item.id) === String(playerId));
  const existing = confirmations.find((entry) => String(entry.player_id) === String(playerId));
  const currentlyConfirmed = existing?.confirmed === true;
  const currentlyWaitlisted = isWaitlistEntry(existing);
  const now = new Date().toISOString();

  if (currentlyConfirmed) {
    const cancelled = confirmations.map((entry) => String(entry.player_id) === String(playerId) ? { ...entry, confirmed: false, status: 'cancelled', removed_by_admin: false, confirmed_at: null, cancelled_at: now, timestamp: now } : entry);
    const promoted = promoteFirstWaitlisted(cancelled, now, playerId);
    patchState({
      confirmations: mergeScopedConfirmations(snapshot, normalizeWaitlistPositions(promoted.confirmations)),
      ...buildDrawRemovalPatch(snapshot, playerId, now),
    });
    return { ok: true, message: promoted.promoted ? 'Presença cancelada. Primeiro da fila entrou automaticamente.' : 'Presença cancelada.' };
  }

  if (currentlyWaitlisted) {
    const updated = confirmations.map((entry) => String(entry.player_id) === String(playerId) ? { ...entry, confirmed: false, status: 'cancelled', removed_by_admin: false, confirmed_at: null, cancelled_at: now, waitlisted_at: null, waitlist_position: null, timestamp: now } : entry);
    patchState({
      confirmations: mergeScopedConfirmations(snapshot, normalizeWaitlistPositions(updated)),
      ...buildDrawRemovalPatch(snapshot, playerId, now),
    });
    return { ok: true, message: 'Você saiu da fila de espera.' };
  }

  const goalkeeperPlayer = isGoalkeeperPlayer(player);
  const goalkeeperCount = getConfirmedGoalkeeperCount(capacityConfirmations, snapshot.players || []);

  if (goalkeeperPlayer && goalkeeperCount >= 2) {
    return { ok: false, message: 'O jogo já tem 2 goleiros confirmados.' };
  }

  const decision = getPresenceDecision({ player, game, confirmations: capacityConfirmations });

  if (!decision.canConfirm) {
    if (decision.reasonBlocked === 'game_full' && !goalkeeperPlayer) {
      const updated = normalizeWaitlistPositions(upsertWaitlistEntry({ ...snapshot, confirmations }, playerId, now));
      const position = getWaitlistEntries(updated).findIndex((entry) => String(entry.player_id) === String(playerId)) + 1;
      patchScopedConfirmations(snapshot, updated);
        return { ok: true, message: `Jogo cheio. Você entrou na fila de espera${position ? ` na posição ${position}` : ''}.` };
    }

    if (decision.reasonBlocked === 'game_full' && goalkeeperPlayer) {
      // Goleiro tem segmento próprio e não deve ser bloqueado pela lotação dos jogadores de linha.
    } else {
      return { ok: false, message: decision.message || 'Você não pode confirmar presença agora.' };
    }
  }

  let updated;
  if (existing) {
    updated = confirmations.map((entry) => String(entry.player_id) === String(playerId) ? normalizeGoalkeeperConfirmation({ ...entry, confirmed: true, status: 'confirmed', waitlisted_at: null, waitlist_position: null, removed_by_admin: false, confirmed_at: now, cancelled_at: null, timestamp: now, game_key: gameKey }, player) : entry);
  } else {
    updated = [...confirmations, normalizeGoalkeeperConfirmation({ player_id: playerId, game_key: gameKey, confirmed: true, status: 'confirmed', removed_by_admin: false, confirmed_at: now, cancelled_at: null, waitlisted_at: null, waitlist_position: null, timestamp: now }, player)];
  }
  patchScopedConfirmations(snapshot, normalizeWaitlistPositions(updated));
  return { ok: true, message: 'Presença confirmada.' };
}

// Remove um jogador do resultado de campeonato JÁ LANÇADO do jogo informado
// (tira dos statuses e dos times A/B). Sem isto, remover alguém da escalação
// deixava os pontos daquele jogo pendurados na classificação — um jogador que
// não jogou continuava com a derrota (1 ponto) lançada pelo sorteio.
function scrubPlayerFromGameResults(championship, gameKey, playerId) {
  const active = championship && typeof championship === 'object' ? championship.active : null;
  if (!active || !Array.isArray(active.results)) return { championship, changed: false };
  const pid = String(playerId);
  let changed = false;
  const results = active.results.map((result) => {
    if (String(result?.game_key || '') !== String(gameKey)) return result;
    const inStatuses = result.statuses && Object.prototype.hasOwnProperty.call(result.statuses, pid);
    const inTeams = (Array.isArray(result.team_a) && result.team_a.some((id) => String(id) === pid)) ||
                    (Array.isArray(result.team_b) && result.team_b.some((id) => String(id) === pid));
    if (!inStatuses && !inTeams) return result;
    changed = true;
    const statuses = { ...(result.statuses || {}) };
    delete statuses[pid];
    return {
      ...result,
      statuses,
      team_a: (Array.isArray(result.team_a) ? result.team_a : []).filter((id) => String(id) !== pid),
      team_b: (Array.isArray(result.team_b) ? result.team_b : []).filter((id) => String(id) !== pid),
    };
  });
  return changed ? { championship: { ...championship, active: { ...active, results } }, changed: true } : { championship, changed: false };
}

/**
 * Remove um jogador confirmado do jogo vigente por ação administrativa.
 *
 * Efeitos:
 * - marca a confirmação como false;
 * - preserva o histórico da entrada em confirmations;
 * - remove o jogador dos times sorteados, quando houver sorteio ativo;
 * - remove o jogador do resultado de campeonato já lançado deste jogo;
 * - libera a vaga para nova confirmação futura.
 */
export function adminRemovePlayerFromGame(playerId) {
  const snapshot = getState();

  const targetId = String(playerId);
  const now = new Date().toISOString();
  const gameKey = activeGameKey(snapshot);

  const scoped = scopedConfirmations(snapshot);
  const updatedScopedConfirmations = scoped.map((entry) => (
    String(entry.player_id) === targetId
      ? {
          ...entry,
          confirmed: false,
          status: 'removed',
          removed_by_admin: true,
          confirmed_at: null,
          cancelled_at: null,
          waitlisted_at: null,
          waitlist_position: null,
          timestamp: now,
        }
      : entry
  ));

  const promoted = promoteFirstWaitlisted(updatedScopedConfirmations, now, targetId);
  const scrub = scrubPlayerFromGameResults(snapshot.championship, gameKey, targetId);

  patchState({
    confirmations: mergeScopedConfirmations(snapshot, normalizeWaitlistPositions(promoted.confirmations)),
    ...(scrub.changed ? { championship: scrub.championship } : {}),
    ...buildDrawRemovalPatch(snapshot, targetId, now),
  });

  return {
    ok: true,
    message: promoted.promoted
      ? 'Jogador removido. Primeiro da fila entrou automaticamente.'
      : (scrub.changed
          ? 'Jogador removido do jogo e dos pontos deste jogo no campeonato.'
          : 'Jogador removido do jogo pelo admin.'),
  };
}


function getPositionBucket(player) {
  const raw = String(player?.position || 'meia')
    .trim()
    .toLowerCase();

  if (
    raw === 'gol' ||
    raw === 'goleiro'
  ) {
    return 'gol';
  }

  if (
    raw === 'zag' ||
    raw === 'zagueiro'
  ) {
    return 'zag';
  }

  if (
    raw === 'atk' ||
    raw === 'atacante'
  ) {
    return 'atk';
  }

  return 'meia';
}

function sortByName(a, b) {
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR');
}

function getDisplayOrderValue(player) {
  const position = getPositionBucket(player);
  if (position === 'gol') return 0;
  if (position === 'zag') return 1;
  if (position === 'meia') return 2;
  if (position === 'atk') return 3;
  return 99;
}

function sortPlayersForDisplay(players = []) {
  return [...players].sort((a, b) => {
    const positionDiff = getDisplayOrderValue(a) - getDisplayOrderValue(b);
    if (positionDiff !== 0) return positionDiff;
    return sortByName(a, b);
  });
}


function balanceTeams(players) {
  const teamA = [];
  const teamB = [];

  const buckets = {
    gol: [],
    zag: [],
    meia: [],
    atk: [],
  };

  players.forEach((player) => {
    buckets[getPositionBucket(player)].push(player);
  });

  Object.values(buckets).forEach((bucket) => {
    const shuffled = [...bucket].sort(() => Math.random() - 0.5);

    shuffled.forEach((player) => {
      const currentPosition = getPositionBucket(player);
      const countA = teamA.filter((p) => getPositionBucket(p) === currentPosition).length;
      const countB = teamB.filter((p) => getPositionBucket(p) === currentPosition).length;

      if (countA < countB) return teamA.push(player);
      if (countB < countA) return teamB.push(player);

      if (teamA.length <= teamB.length) teamA.push(player);
      else teamB.push(player);
    });
  });

  return {
    teamA: sortPlayersForDisplay(teamA),
    teamB: sortPlayersForDisplay(teamB),
  };
}


export function drawTeams() {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const gameKey = activeGameKey(snapshot);
  const confirmedIds = new Set(
    scopedConfirmations(snapshot)
      .filter((entry) => entry?.confirmed)
      .map((entry) => entry.player_id)
  );

  const confirmedPlayers = (snapshot.players || [])
    .filter((player) => confirmedIds.has(String(player.id)))
    .filter((player) => player.plays_football !== false)
    .filter((player) => !isCarneOnly(player));

  const rentalGoalkeepers = getRentalGoalkeepers(game).map((entry) => ({
    id: entry.id,
    name: entry.name,
    position: 'gol',
    plays_football: true,
    role: 'player',
    temporary: true,
    rental_goalkeeper: true,
  }));

  const eligiblePlayers = [...confirmedPlayers, ...rentalGoalkeepers];

  if (eligiblePlayers.length < 2) {
    return {
      ok: false,
      message: 'É preciso ter pelo menos 2 jogadores confirmados para sortear times.',
    };
  }

  const { teamA, teamB } = balanceTeams(eligiblePlayers);
  const createdAt = new Date().toISOString();
  
  const drawId = `draw_${gameKey}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sortResult = {
    id: drawId,
    game_key: gameKey,
    game_date: game.game_date || '',
    game_time: game.game_time || '',
    created_at: createdAt,
    total_players: eligiblePlayers.length,
    team_a: teamA.map((player) => player.rental_goalkeeper ? player : player.id),
    team_b: teamB.map((player) => player.rental_goalkeeper ? player : player.id),
  };

  const drawHistory = Array.isArray(game.draw_history) ? game.draw_history : [];

  const updatedGame = { ...game, sort_result: sortResult, draw_history: [...drawHistory.filter((entry) => String(entry?.id || '') !== drawId), sortResult].slice(-30) };
  patchState({ game: updatedGame, games: (snapshot.games || []).map((item) => String(item.game_key || item.id) === gameKey ? updatedGame : item) });

  return {
    ok: true,
    message: 'Times sorteados com sucesso.',
    sortResult,
  };
}


export function addConfirmedPlayerToDraw(playerId, targetTeamKey = 'team_a') {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const sortResult = game?.sort_result;

  if (!sortResult) {
    return { ok: false, message: 'Nenhum sorteio disponível para editar.' };
  }

  const targetKey = targetTeamKey === 'team_b' ? 'team_b' : 'team_a';
  const sourceKey = targetKey === 'team_a' ? 'team_b' : 'team_a';

  const teamA = Array.isArray(sortResult.team_a) ? [...sortResult.team_a] : [];
  const teamB = Array.isArray(sortResult.team_b) ? [...sortResult.team_b] : [];
  const getEntryId = (entry) => (entry && typeof entry === 'object') ? entry.id : entry;
  const targetId = String(playerId);

  if ([...teamA, ...teamB].some((entry) => String(getEntryId(entry)) === targetId)) {
    return { ok: false, message: 'Jogador já está no sorteio.' };
  }

  const confirmedIds = new Set(
    scopedConfirmations(snapshot)
      .filter((entry) => entry?.confirmed)
      .map((entry) => String(entry.player_id))
  );

  const rentalGoalkeeper = getRentalGoalkeepers(game).find((entry) => String(entry.id) === targetId);
  const registeredPlayer = (snapshot.players || []).find((player) => String(player.id) === targetId);

  if (!rentalGoalkeeper && (!registeredPlayer || !confirmedIds.has(targetId))) {
    return { ok: false, message: 'Jogador precisa estar confirmado para entrar no sorteio.' };
  }

  const playerEntry = rentalGoalkeeper
    ? {
        id: rentalGoalkeeper.id,
        name: rentalGoalkeeper.name,
        position: 'gol',
        plays_football: true,
        role: 'player',
        temporary: true,
        rental_goalkeeper: true,
      }
    : registeredPlayer.id;

  const adjustedDraw = {
    ...sortResult,
    [targetKey]: targetKey === 'team_a' ? [...teamA, playerEntry] : [...teamB, playerEntry],
    [sourceKey]: sourceKey === 'team_a' ? teamA : teamB,
    adjusted_at: new Date().toISOString(),
  };

  const drawHistory = Array.isArray(game.draw_history) ? game.draw_history : [];
  const updatedGame = {
    ...game,
    sort_result: adjustedDraw,
    draw_history: drawHistory.map((entry) => (
      String(entry?.id || '') === String(sortResult.id || '') ? adjustedDraw : entry
    )),
  };

  patchActiveGame(snapshot, updatedGame);

  return { ok: true, message: 'Jogador incluído no sorteio.' };
}


export function moveDrawnPlayer(playerId, fromTeamKey) {
  const snapshot = getState();
  const game = activeGame(snapshot);
  const sortResult = game?.sort_result;

  if (!sortResult) {
    return { ok: false, message: 'Nenhum sorteio disponível para ajustar.' };
  }

  const sourceKey = fromTeamKey === 'team_a' ? 'team_a' : fromTeamKey === 'team_b' ? 'team_b' : null;

  if (!sourceKey) {
    return { ok: false, message: 'Time de origem inválido.' };
  }

  const targetKey = sourceKey === 'team_a' ? 'team_b' : 'team_a';
  const sourceTeam = Array.isArray(sortResult[sourceKey]) ? [...sortResult[sourceKey]] : [];
  const targetTeam = Array.isArray(sortResult[targetKey]) ? [...sortResult[targetKey]] : [];
  const getEntryId = (entry) => (entry && typeof entry === 'object') ? entry.id : entry;
  const sourceIndex = sourceTeam.findIndex((entry) => String(getEntryId(entry)) === String(playerId));

  if (sourceIndex === -1) {
    return { ok: false, message: 'Jogador não encontrado no time informado.' };
  }

  const [movedPlayerEntry] = sourceTeam.splice(sourceIndex, 1);
  targetTeam.push(movedPlayerEntry);

  const adjustedDraw = {
    ...sortResult,
    [sourceKey]: sourceTeam,
    [targetKey]: targetTeam,
    adjusted_at: new Date().toISOString(),
  };
  const drawHistory = Array.isArray(game.draw_history) ? game.draw_history : [];

  patchActiveGame(snapshot, {
    ...game,
    sort_result: adjustedDraw,
    draw_history: drawHistory.map((entry) => (
      String(entry?.id || '') === String(sortResult.id || '') ? adjustedDraw : entry
    )),
  });

  return { ok: true, message: 'Jogador movido.' };
}

export function clearTeamDraw() {
  const snapshot = getState();
  const game = activeGame(snapshot);
  patchActiveGame(snapshot, {
    ...game,
    sort_result: null,
    draw_history: [],
  });

  return { ok: true, message: 'Sorteio limpo.' };
}
