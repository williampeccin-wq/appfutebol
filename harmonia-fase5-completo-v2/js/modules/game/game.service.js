import { canConfirm } from '../finance/finance.service.js';
import { getState, patchState } from '../../core/state.js';

export function isConfirmed(playerId) {
  const snapshot = getState();
  return snapshot.confirmations.some((item) => item.player_id === playerId && item.confirmed);
}

export function toggleConfirmation(playerId) {
  const snapshot = getState();
  const player = snapshot.players.find(p => p.id === playerId);
  if (!canConfirm(player)) {
    return; // bloqueia ação
  }

  const existing = snapshot.confirmations.find(
    (c) => c.player_id === playerId
  );

  let updated;

  if (existing) {
    updated = snapshot.confirmations.map((c) =>
      c.player_id === playerId
        ? { ...c, confirmed: !c.confirmed, timestamp: new Date().toISOString() }
        : c
    );
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

  patchState({
    confirmations: updated,
  });
}

export function canManagePresence(player, game) {
  if (!player) {
    return { ok: false, message: 'Usuário não identificado.' };
  }
  if (player.role === 'carne') {
    return { ok: false, message: 'Perfis somente carne não participam da confirmação do jogo.' };
  }
  if (!player.mens_ok) {
    return { ok: false, message: 'Você não pode confirmar presença pois sua mensalidade está pendente.' };
  }
  if (!game?.mens_expire_date) {
    return { ok: false, message: 'A mensalidade ainda não tem data de vencimento configurada.' };
  }
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const expireDate = new Date(`${game.mens_expire_date}T12:00:00`);
  if (expireDate < today) {
    return { ok: false, message: 'Você não pode confirmar presença pois a mensalidade está vencida.' };
  }
  if (!game?.open) {
    return { ok: false, message: 'As inscrições estão fechadas.' };
  }
  return { ok: true, message: '' };
}
