import { isCarneOnly, isMensalidadeExempt } from '../../domain/authz.js';
import { isAfterMensalidadeDueDate } from '../../domain/rules.engine.js';

// PHASE 8 — FINANCE BASIC

function isFinanceExempt(player) {
  return isMensalidadeExempt(player);
}

export function isMensalidadeOk(player) {
  if (!player) return false;
  if (isFinanceExempt(player)) return true;
  return player.mens_ok === true;
}

export function canConfirm(player, game = null) {
  if (!player) return false;
  if (isCarneOnly(player)) return false;      // carne não joga
  if (player.status === 'inactive') return false;
  if (isMensalidadeExempt(player)) return true; // goleiro isento joga sem mensalidade
  if (player.mens_ok === true) return true;
  return !isAfterMensalidadeDueDate(game);
}

export function marcarComoPago(snapshot, playerId) {
  const player = snapshot?.players?.find((item) => item.id === playerId);
  if (player) player.mens_ok = true;
  return snapshot;
}

export function marcarComoInadimplente(snapshot, playerId) {
  const player = snapshot?.players?.find((item) => item.id === playerId);
  if (player && !isMensalidadeExempt(player)) player.mens_ok = false;
  return snapshot;
}
