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
  return getWaitlistEntries(snapshot.confirmations || [])
    .map((entry, index) => ({
      ...entry,
      position: index + 1,
      player: playersById.get(String(entry.player_id)) || null,
    }))
    .filter((entry) => entry.player);
}


export function toggleConfirmation(playerId) {
  const snapshot = getState();
  const player = snapshot.players.find((item) => String(item.id) === String(playerId));
  const existing = snapshot.confirmations.find((entry) => String(entry.player_id) === String(playerId));
  const currentlyConfirmed = existing?.confirmed === true;
  const currentlyWaitlisted = isWaitlistEntry(existing);
  const now = new Date().toISOString();

  if (currentlyConfirmed) {
    const cancelled = snapshot.confirmations.map((entry) => (
      String(entry.player_id) === String(playerId)
        ? {
            ...entry,
            confirmed: false,
            status: 'cancelled',
            removed_by_admin: false,
            confirmed_at: null,
            cancelled_at: now,
            timestamp: now,
          }
        : entry
    ));

    const promoted = promoteFirstWaitlisted(cancelled, now, playerId);
    patchState({ confirmations: normalizeWaitlistPositions(promoted.confirmations) });

    return {
      ok: true,
      message: promoted.promoted
        ? 'Presença cancelada. Primeiro da fila entrou automaticamente.'
        : 'Presença cancelada.',
    };
  }

  if (currentlyWaitlisted) {
    const updated = snapshot.confirmations.map((entry) => (
      String(entry.player_id) === String(playerId)
        ? {
            ...entry,
            confirmed: false,
            status: 'cancelled',
            removed_by_admin: false,
            confirmed_at: null,
            cancelled_at: now,
            waitlisted_at: null,
            waitlist_position: null,
            timestamp: now,
          }
        : entry
    ));

    patchState({ confirmations: normalizeWaitlistPositions(updated) });
    return { ok: true, message: 'Você saiu da fila de espera.' };
  }

  const decision = getPresenceDecision({
    player,
    game: snapshot.game,
    confirmations: snapshot.confirmations,
  });

  if (!decision.canConfirm) {
    if (decision.reasonBlocked === 'game_full') {
      const updated = normalizeWaitlistPositions(upsertWaitlistEntry(snapshot, playerId, now));
      const position = getWaitlistEntries(updated).findIndex((entry) => String(entry.player_id) === String(playerId)) + 1;
      patchState({ confirmations: updated });
      return {
        ok: true,
        message: `Jogo cheio. Você entrou na fila de espera${position ? ` na posição ${position}` : ''}.`,
      };
    }

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
            waitlisted_at: null,
            waitlist_position: null,
            removed_by_admin: false,
            confirmed_at: now,
            cancelled_at: null,
            timestamp: now,
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
        confirmed_at: now,
        cancelled_at: null,
        waitlisted_at: null,
        waitlist_position: null,
        timestamp: now,
      },
    ];
  }

  patchState({ confirmations: normalizeWaitlistPositions(updated) });
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
          waitlisted_at: null,
          waitlist_position: null,
          timestamp: now,
        }
      : entry
  ));

  const promoted = promoteFirstWaitlisted(updatedConfirmations, now, targetId);

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
    confirmations: normalizeWaitlistPositions(promoted.confirmations),
    game: updatedGame,
  });

  return {
    ok: true,
    message: promoted.promoted
      ? 'Jogador removido. Primeiro da fila entrou automaticamente.'
      : 'Jogador removido do jogo pelo admin.',
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
