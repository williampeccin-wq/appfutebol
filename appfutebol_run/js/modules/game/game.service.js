import { isCarneOnly, playsFootball as authzPlaysFootball } from '../../domain/authz.js';
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
  const player = snapshot.players.find((item) => String(item.id) === String(playerId));
  const existing = snapshot.confirmations.find((entry) => String(entry.player_id) === String(playerId));
  const currentlyConfirmed = existing?.confirmed === true;

  if (currentlyConfirmed) {
    const updated = snapshot.confirmations.map((entry) => (
      String(entry.player_id) === String(playerId)
        ? {
            ...entry,
            confirmed: false,
            status: 'cancelled',
            removed_by_admin: false,
            confirmed_at: null,
            cancelled_at: new Date().toISOString(),
            timestamp: new Date().toISOString(),
          }
        : entry
    ));
    patchState({ confirmations: updated });
    return { ok: true, message: 'Presença cancelada.' };
  }

  const decision = getPresenceDecision({
    player,
    game: snapshot.game,
    confirmations: snapshot.confirmations,
  });

  if (!decision.canConfirm) {
    return { ok: false, message: decision.message || 'Você não pode confirmar presença agora.' };
  }

  let updated;

  if (existing) {
    updated = snapshot.confirmations.map((entry) => (
      String(entry.player_id) === String(playerId)
        ? {
            ...entry,
            confirmed: true,
            status: 'confirmed',
            removed_by_admin: false,
            confirmed_at: new Date().toISOString(),
            cancelled_at: null,
            timestamp: new Date().toISOString(),
          }
        : entry
    ));
  } else {
    updated = [
      ...snapshot.confirmations,
      {
        player_id: playerId,
        confirmed: true,
        status: 'confirmed',
        removed_by_admin: false,
        confirmed_at: new Date().toISOString(),
        cancelled_at: null,
        timestamp: new Date().toISOString(),
      },
    ];
  }

  patchState({ confirmations: updated });
  return { ok: true, message: 'Presença confirmada.' };
}


/**
 * Remove um jogador confirmado do jogo vigente por ação administrativa.
 *
 * Efeitos:
 * - marca a confirmação como false;
 * - preserva o histórico da entrada em confirmations;
 * - remove o jogador dos times sorteados, quando houver sorteio ativo;
 * - libera a vaga para nova confirmação futura.
 */
export function adminRemovePlayerFromGame(playerId) {
  const snapshot = getState();

  const targetId = String(playerId);
  const now = new Date().toISOString();

  const updatedConfirmations = (snapshot.confirmations || []).map((entry) => (
    String(entry.player_id) === targetId
      ? {
          ...entry,
          confirmed: false,
          status: 'removed',
          removed_by_admin: true,
          confirmed_at: null,
          cancelled_at: null,
          timestamp: now,
        }
      : entry
  ));

  const getEntryId = (entry) => (entry && typeof entry === 'object') ? entry.id : entry;
  const removeFromTeam = (team) => (Array.isArray(team) ? team.filter((entry) => String(getEntryId(entry)) !== targetId) : []);

  let updatedGame = { ...(snapshot.game || {}) };

  if (updatedGame?.sort_result) {
    updatedGame = {
      ...updatedGame,
      sort_result: {
        ...updatedGame.sort_result,
        team_a: removeFromTeam(updatedGame.sort_result.team_a),
        team_b: removeFromTeam(updatedGame.sort_result.team_b),
        adjusted_at: now,
      },
    };
  }

  patchState({
    confirmations: updatedConfirmations,
    game: updatedGame,
  });

  return {
    ok: true,
    message: 'Jogador removido do jogo pelo admin.',
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
  const confirmedIds = new Set(
    (snapshot.confirmations || [])
      .filter((entry) => entry?.confirmed)
      .map((entry) => entry.player_id)
  );

  const eligiblePlayers = (snapshot.players || [])
    .filter((player) => confirmedIds.has(player.id))
    .filter((player) => player.plays_football !== false)
    .filter((player) => !isCarneOnly(player));

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
