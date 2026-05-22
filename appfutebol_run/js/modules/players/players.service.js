import { getState } from '../../core/state.js';
import { isAdmin as authzIsAdmin, playsFootball as authzPlaysFootball } from '../../domain/authz.js';

function normalizeParticipation(player) {
  const playsFootball = authzPlaysFootball(player);
  const inCarneGroup = player?.in_carne_group !== undefined ? player.in_carne_group : true;
  return { playsFootball, inCarneGroup };
}

export function listPlayers() {
  const snapshot = getState();
  return [...snapshot.players].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function listJogadores() {
  return listPlayers().filter((player) => normalizeParticipation(player).playsFootball);
}

export function listCarneOnly() {
  return listPlayers().filter((player) => {
    const meta = normalizeParticipation(player);
    return meta.inCarneGroup && !meta.playsFootball;
  });
}

export function isAdmin(player) {
  return authzIsAdmin(player);
}

export function isCurrentPlayer(player, currentPlayer) {
  return !!player && !!currentPlayer && player.id === currentPlayer.id;
}

export function isConfirmed(playerId, confirmations) {
  return confirmations.some((item) => item.player_id === playerId && item.confirmed);
}

export function getRoleLabel(player) {
  if (isAdmin(player)) return 'Administrador';
  const meta = normalizeParticipation(player);
  return meta.playsFootball ? 'Jogador' : 'Carne';
}

export function getPositionLabel(position) {
  const labels = {
    zag: 'Zagueiro',
    meia: 'Meia',
    atk: 'Atacante',
  };
  return labels[position] || 'Sem posição';
}

export function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return digits;
}

export function getInitials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}


export function formatBirthDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return raw;
  }

  return raw;
}
