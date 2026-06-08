import { isCarneOnly } from '../../domain/authz.js';

// PHASE 8 — FINANCE BASIC

function isFinanceExempt(player) {
  return isCarneOnly(player);
}

export function isMensalidadeOk(player) {
  if (!player) return false;
  if (isFinanceExempt(player)) return true;
  return player.mens_ok === true;
}

export function canConfirm(player) {
  if (!player) return false;
  if (isCarneOnly(player)) return false;
  if (player.status === 'inactive') return false;
  return player.mens_ok === true;
}

export function marcarComoPago(snapshot, playerId) {
  const player = snapshot?.players?.find((item) => item.id === playerId);
  if (player) player.mens_ok = true;
  return snapshot;
}

export function marcarComoInadimplente(snapshot, playerId) {
  const player = snapshot?.players?.find((item) => item.id === playerId);
  if (player && !isCarneOnly(player)) player.mens_ok = false;
  return snapshot;
}
