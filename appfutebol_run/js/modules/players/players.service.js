import { getState } from '../../core/state.js';
import { isAdmin as authzIsAdmin, playsFootball as authzPlaysFootball } from '../../domain/authz.js';
import { getTopRatedPlayerId } from '../../services/ratings.service.js';

function normalizeParticipation(player) {
  const playsFootball = authzPlaysFootball(player);
  const inCarneGroup = player?.in_carne_group !== undefined ? player.in_carne_group : true;
  return { playsFootball, inCarneGroup };
}

export function listPlayers() {
  const snapshot = getState();
  return [...snapshot.players].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function listActivePlayers() {
  return listPlayers().filter((player) => !player.left_team);
}

export function listJogadores() {
  return listActivePlayers().filter((player) => normalizeParticipation(player).playsFootball);
}

export function listCarneOnly() {
  return listActivePlayers().filter((player) => {
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
    gol: 'Goleiro',
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


export function getPlayerPhoto(player) {
  // Preferir a URL no Storage (cacheável, fora do payload do poll); base64 é
  // fallback para fotos ainda não migradas.
  return player?.photo_url || player?.photoDataUrl || '';
}

export function getAvatarHtml(player, extraClass = '') {
  const photo = getPlayerPhoto(player);
  const initials = getInitials(player?.name);
  const safeName = String(player?.name || 'jogador').replaceAll('"', '&quot;');
  const aura = (player?.id && String(player.id) === String(getTopRatedPlayerId())) ? ' avatar-aura' : '';

  if (photo) {
    return `<div class="avatar avatar-photo ${extraClass}${aura}"><img src="${photo}" alt="Foto de ${safeName}" loading="lazy" /></div>`;
  }

  return `<div class="avatar ${extraClass}${aura}">${initials}</div>`;
}

export function isoToDisplay(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function displayToIso(display) {
  if (!display) return '';
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}
