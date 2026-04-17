// PHASE 8 — FINANCE BASIC

export function getInadimplentes(snapshot) {
  return snapshot?.finance?.inadimplentes || [];
}

export function isInadimplente(snapshot, playerId) {
  return getInadimplentes(snapshot).includes(playerId);
}

export function canConfirm(player, snapshot = null) {
  if (!player) return false;
  if (player.role === 'carne') return false;
  if (player.status === 'inactive') return false;
  if (snapshot && isInadimplente(snapshot, player.id)) return false;
  return !!player.mens_ok;
}

export function marcarComoPago(snapshot, playerId) {
  if (!snapshot.finance) snapshot.finance = {};
  if (!Array.isArray(snapshot.finance.inadimplentes)) snapshot.finance.inadimplentes = [];
  snapshot.finance.inadimplentes = snapshot.finance.inadimplentes.filter((id) => id !== playerId);
  return snapshot;
}

export function marcarComoInadimplente(snapshot, playerId) {
  if (!snapshot.finance) snapshot.finance = {};
  if (!Array.isArray(snapshot.finance.inadimplentes)) snapshot.finance.inadimplentes = [];
  if (!snapshot.finance.inadimplentes.includes(playerId)) {
    snapshot.finance.inadimplentes.push(playerId);
  }
  return snapshot;
}
