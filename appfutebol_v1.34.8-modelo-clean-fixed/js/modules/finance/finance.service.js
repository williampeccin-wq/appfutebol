// PHASE 8 — FINANCE BASIC

function isFinancePendingPlayer(player) {
  if (!player) return false;
  if (player.is_admin) return false;
  if (player.role === 'carne') return false;
  return !player.mens_ok;
}

export function canConfirm(player) {
  if (!player) return false;
  if (player.role === 'carne') return false;
  if (player.status === 'inactive') return false;
  return !isFinancePendingPlayer(player);
}

export function marcarComoPago(snapshot, playerId) {
  const player = (snapshot?.players || []).find((item) => item.id === playerId);
  if (player) {
    player.mens_ok = true;
  }
  return snapshot;
}

export function marcarComoInadimplente(snapshot, playerId) {
  const player = (snapshot?.players || []).find((item) => item.id === playerId);
  if (player) {
    player.mens_ok = false;
  }
  return snapshot;
}
