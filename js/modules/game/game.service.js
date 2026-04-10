
// PHASE5.3 IDS SOURCE
function __ensureIds(game) {
  if (!Array.isArray(game.confirmedPlayerIds)) game.confirmedPlayerIds = [];
  if (!Array.isArray(game.waitlistPlayerIds)) game.waitlistPlayerIds = [];
}

function __confirmById(game, playerId) {
  __ensureIds(game);
  if (!game.confirmedPlayerIds.includes(playerId)) {
    game.confirmedPlayerIds.push(playerId);
  }
  game.waitlistPlayerIds = game.waitlistPlayerIds.filter(id => id !== playerId);
}

function __cancelById(game, playerId) {
  __ensureIds(game);
  game.confirmedPlayerIds = game.confirmedPlayerIds.filter(id => id !== playerId);
}

function __isConfirmed(game, playerId) {
  __ensureIds(game);
  return game.confirmedPlayerIds.includes(playerId);
}

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
