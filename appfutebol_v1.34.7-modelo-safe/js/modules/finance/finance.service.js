// PHASE 8 — FINANCE BASIC

export function isMensalidadeOk(player) {
  return !!player?.mens_ok;
}

export function canConfirm(player) {
  if (!player) return false;
  if (player.role === 'carne') return false;
  if (player.status === 'inactive') return false;
  return isMensalidadeOk(player);
}

export function markAsPaid(player) {
  if (!player) return player;
  player.mens_ok = true;
  return player;
}

export function markAsDebt(player) {
  if (!player) return player;
  player.mens_ok = false;
  return player;
}
