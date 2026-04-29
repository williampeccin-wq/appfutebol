import { getState, patchState } from '../../core/state.js';
import { getPresenceDecision, isGameFull } from '../../domain/rules.engine.js';

export function hasCapacity() {
  const snapshot = getState();
  return !isGameFull(snapshot.game, snapshot.confirmations);
}

export function isConfirmed(playerId) {
  const snapshot = getState();
  return snapshot.confirmations.some((item) => item.player_id === playerId && item.confirmed);
}

export function getPresenceGuard(player, game) {
  const snapshot = getState();
  const decision = getPresenceDecision({
    player,
    game,
    confirmations: snapshot.confirmations,
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

export function toggleConfirmation(playerId) {
  const snapshot = getState();
  const player = snapshot.players.find((item) => item.id === playerId);
  const decision = getPresenceDecision({
    player,
    game: snapshot.game,
    confirmations: snapshot.confirmations,
  });

  if (!decision.canConfirm && !decision.canCancel) {
    return { ok: false, message: decision.message };
  }

  const existing = snapshot.confirmations.find((entry) => entry.player_id === playerId);
  let updated;

  if (existing) {
    updated = snapshot.confirmations.map((entry) => (
      entry.player_id === playerId
        ? { ...entry, confirmed: !entry.confirmed, timestamp: new Date().toISOString() }
        : entry
    ));
  } else {
    updated = [
      ...snapshot.confirmations,
      {
        player_id: playerId,
        confirmed: true,
        timestamp: new Date().toISOString(),
      },
    ];
  }

  patchState({ confirmations: updated });
  return { ok: true };
}


function getPositionBucket(player) {
  const position = player?.position || 'meia';
  if (position === 'zag') return 'zag';
  if (position === 'atk') return 'atk';
  return 'meia';
}

function sortByName(a, b) {
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR');
}

function balanceTeams(players) {
  const teamA = [];
  const teamB = [];

  const buckets = {
    zag: [],
    meia: [],
    atk: [],
  };

  players.forEach((player) => {
    buckets[getPositionBucket(player)].push(player);
  });

  Object.values(buckets).forEach((bucket) => {
    bucket.sort(sortByName);
    bucket.forEach((player, index) => {
      const target = teamA.length <= teamB.length
        ? (index % 2 === 0 ? teamA : teamB)
        : (index % 2 === 0 ? teamB : teamA);
      target.push(player);
    });
  });

  return {
    teamA: teamA.sort(sortByName),
    teamB: teamB.sort(sortByName),
  };
}

export function drawTeams() {
  const snapshot = getState();
  const confirmedIds = new Set(
    (snapshot.confirmations || [])
      .filter((entry) => entry?.confirmed)
      .map((entry) => entry.player_id)
  );

  const eligiblePlayers = (snapshot.players || [])
    .filter((player) => confirmedIds.has(player.id))
    .filter((player) => player.plays_football !== false)
    .filter((player) => player.role !== 'carne');

  if (eligiblePlayers.length < 2) {
    return {
      ok: false,
      message: 'É preciso ter pelo menos 2 jogadores confirmados para sortear times.',
    };
  }

  const { teamA, teamB } = balanceTeams(eligiblePlayers);
  const sortResult = {
    created_at: new Date().toISOString(),
    total_players: eligiblePlayers.length,
    team_a: teamA.map((player) => player.id),
    team_b: teamB.map((player) => player.id),
  };

  patchState({
    game: {
      ...(snapshot.game || {}),
      sort_result: sortResult,
    },
  });

  return {
    ok: true,
    message: 'Times sorteados com sucesso.',
    sortResult,
  };
}


export function moveDrawnPlayer(playerId, fromTeamKey) {
  const snapshot = getState();
  const sortResult = snapshot.game?.sort_result;

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

  patchState({
    game: {
      ...(snapshot.game || {}),
      sort_result: {
        ...sortResult,
        [sourceKey]: sourceTeam,
        [targetKey]: targetTeam,
        adjusted_at: new Date().toISOString(),
      },
    },
  });

  return { ok: true, message: 'Jogador movido.' };
}

export function clearTeamDraw() {
  const snapshot = getState();
  patchState({
    game: {
      ...(snapshot.game || {}),
      sort_result: null,
    },
  });

  return { ok: true, message: 'Sorteio limpo.' };
}
