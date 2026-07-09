// Centralized authorization helpers.
// SQL columns (players.is_admin/auth_user_id) are the authoritative source.
// Legacy JSON fields are tolerated only as fallback while old data is migrated.

function truthy(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

export function isAdmin(player) {
  if (!player) return false;
  if (truthy(player.is_admin)) return true;
  // Transitional fallback for legacy snapshots only. Do not use data.is_admin directly elsewhere.
  if (truthy(player?.data?.is_admin)) return true;
  return false;
}

export function getPlayerRole(player) {
  if (!player) return 'guest';
  if (isAdmin(player)) return 'admin';
  if (player.role === 'carne' || player?.data?.role === 'carne') return 'carne';
  return 'player';
}

export function isCarneOnly(player) {
  return getPlayerRole(player) === 'carne' || player?.plays_football === false;
}

// Isenção de MENSALIDADE (não confundir com "não joga"). Carne é isento; e o
// goleiro é isento POR PADRÃO (na maioria dos grupos não paga) — o admin pode
// marcar "paga mensalidade" (gk_pays=true) para o goleiro que for pagante.
export function isMensalidadeExempt(player) {
  if (isCarneOnly(player)) return true;
  const pos = String(player?.position || '').trim().toLowerCase();
  const isGoalkeeper = pos === 'gol' || pos === 'goleiro';
  return isGoalkeeper && player?.gk_pays !== true;
}

export function playsFootball(player) {
  if (!player) return false;
  if (player.plays_football === false) return false;
  return !isCarneOnly(player);
}

export function canManagePlayers(player) {
  return isAdmin(player);
}

export function canManageFinance(player) {
  return isAdmin(player);
}

import { isAfterMensalidadeDueDate } from './rules.engine.js';

export function canManageChampionship(player) {
  return isAdmin(player);
}

export function canManageCarne(player) {
  return isAdmin(player);
}

export function canManagePresence(player) {
  return isAdmin(player);
}

export function canAccessConfig(player) {
  return isAdmin(player);
}

export function canEditOwnProfile(actor, target) {
  return !!actor && !!target && (isAdmin(actor) || actor.id === target.id);
}

export function canConfirmPresence(player, game = null) {
  if (!player) return false;
  if (isCarneOnly(player)) return false;
  if (player.status === 'inactive') return false;
  if (player.mens_ok === true) return true;
  return !isAfterMensalidadeDueDate(game);
}

export function exposeAuthz(currentPlayerProvider) {
  window.HarmoniaAuthz = {
    isAdmin: () => isAdmin(currentPlayerProvider?.()),
    canManagePlayers: () => canManagePlayers(currentPlayerProvider?.()),
    canManageFinance: () => canManageFinance(currentPlayerProvider?.()),
    canManageChampionship: () => canManageChampionship(currentPlayerProvider?.()),
    canManageCarne: () => canManageCarne(currentPlayerProvider?.()),
    canManagePresence: () => canManagePresence(currentPlayerProvider?.()),
    canAccessConfig: () => canAccessConfig(currentPlayerProvider?.()),
    canConfirmPresence: () => canConfirmPresence(currentPlayerProvider?.()),
  };
}
