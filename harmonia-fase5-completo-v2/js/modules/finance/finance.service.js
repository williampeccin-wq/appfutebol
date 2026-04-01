import { getState } from '../../core/state.js';

export function isMensalidadeOk(player) {
  return !!player?.mens_ok;
}

export function isMensalidadeVencida() {
  const snapshot = getState();
  const expire = snapshot.game?.mens_expire_date;
  if (!expire) return false;
  const today = new Date(); today.setHours(12,0,0,0);
  const expireDate = new Date(expire + 'T12:00:00');
  return expireDate < today;
}

export function canConfirm(player) {
  if (!player) return false;
  if (player.role === 'carne') return false;
  if (!isMensalidadeOk(player)) return false;
  if (isMensalidadeVencida()) return false;
  return true;
}
