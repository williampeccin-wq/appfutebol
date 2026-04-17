export function isMensalidadeOk(player) {
  return !!player.mens_ok;
}

export function markAsPaid(player) {
  player.mens_ok = true;
}

export function markAsDebt(player) {
  player.mens_ok = false;
}
