// PHASE 8 — FINANCE BASIC

function isFinancePendingPlayer(player) {
  if (!player) return false;
  if (player.is_admin) return false;
  if (player.role === 'carne') return false;
  return !player.mens_ok;
}

export function getInadimplentes(snapshot) {
  return (snapshot?.players || []).filter(isFinancePendingPlayer).map((player) => player.id);
}

export function isInadimplente(snapshot, playerId) {
  const player = (snapshot?.players || []).find((item) => item.id === playerId);
  return isFinancePendingPlayer(player);
}

export function canConfirm(player, snapshot = null) {
  if (!player) return false;
  if (player.role === 'carne') return false;
  if (player.status === 'inactive') return false;
  if (snapshot && isInadimplente(snapshot, player.id)) return false;
  return !!player.mens_ok;
}

export function marcarComoPago(snapshot, playerId) {
  const player = (snapshot?.players || []).find((item) => item.id === playerId);
  if (player) {
    player.mens_ok = true;
  }
  if (snapshot?.finance?.inadimplentes) {
    delete snapshot.finance.inadimplentes;
    if (!Object.keys(snapshot.finance).length) {
      delete snapshot.finance;
    }
  }
  return snapshot;
}

export function marcarComoInadimplente(snapshot, playerId) {
  const player = (snapshot?.players || []).find((item) => item.id === playerId);
  if (player) {
    player.mens_ok = false;
  }
  if (snapshot?.finance?.inadimplentes) {
    delete snapshot.finance.inadimplentes;
    if (!Object.keys(snapshot.finance).length) {
      delete snapshot.finance;
    }
  }
  return snapshot;
}
