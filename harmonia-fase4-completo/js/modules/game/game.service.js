import { getState, patchState } from '../../core/state.js';

export function isConfirmed(playerId) {
  const snapshot = getState();
  return snapshot.confirmations.some((item) => item.player_id === playerId && item.confirmed);
}

export function toggleConfirmation(playerId) {
  const snapshot = getState();
  const current = snapshot.confirmations.find((item) => item.player_id === playerId);

  let nextConfirmations;
  if (current) {
    nextConfirmations = snapshot.confirmations.map((item) => {
      if (item.player_id !== playerId) return item;
      return {
        ...item,
        confirmed: !item.confirmed,
        timestamp: new Date().toISOString(),
      };
    });
  } else {
    nextConfirmations = [
      ...snapshot.confirmations,
      {
        player_id: playerId,
        confirmed: true,
        timestamp: new Date().toISOString(),
      },
    ];
  }

  patchState({ confirmations: nextConfirmations });
}

export function canManagePresence(player, game) {
  if (!player) {
    return { ok: false, message: 'Usuário não identificado.' };
  }
  if (player.role === 'carne') {
    return { ok: false, message: 'Perfis somente carne não participam da confirmação do jogo.' };
  }
  if (!game?.open) {
    return { ok: false, message: 'As inscrições estão fechadas.' };
  }
  return { ok: true, message: '' };
}
