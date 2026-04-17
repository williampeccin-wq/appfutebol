// PHASE 6 — PROJECTION LAYER

function __legacyGameFromState(state) {
  const legacyGame = state.game || {};
  const confirmations = Array.isArray(state.confirmations) ? state.confirmations : [];
  const confirmedPlayerIds = confirmations.filter((item) => item && item.confirmed).map((item) => item.player_id);
  return {
    ...legacyGame,
    confirmedPlayerIds,
    waitlistPlayerIds: Array.isArray(legacyGame.waitlistPlayerIds) ? legacyGame.waitlistPlayerIds : [],
    maxPlayers: legacyGame.max_players || legacyGame.maxPlayers || 0,
  };
}

export function buildGameView(state, currentPlayerId) {
  const rawGame = state.games?.[0] || __legacyGameFromState(state) || {};
  const players = Array.isArray(state.players) ? state.players : [];
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]));

  const confirmedPlayerIds = Array.isArray(rawGame.confirmedPlayerIds) ? rawGame.confirmedPlayerIds : [];
  const waitlistPlayerIds = Array.isArray(rawGame.waitlistPlayerIds) ? rawGame.waitlistPlayerIds : [];

  const confirmed = confirmedPlayerIds.map((id) => playersById[id]).filter(Boolean);
  const waitlist = waitlistPlayerIds.map((id) => playersById[id]).filter(Boolean);
  const isConfirmed = !!currentPlayerId && confirmedPlayerIds.includes(currentPlayerId);

  const maxPlayers = rawGame.maxPlayers || rawGame.max_players || 0;
  const spotsLeft = Math.max(0, maxPlayers - confirmed.length);

  return {
    game: rawGame,
    confirmed,
    confirmedCount: confirmed.length,
    confirmedPlayerIds,
    waitlist,
    waitlistPlayerIds,
    isConfirmed,
    spotsLeft,
    canConfirm: !isConfirmed && spotsLeft > 0,
    canCancel: isConfirmed,
    maxPlayers,
  };
}

export function buildPlayersView(state) {
  const gameView = buildGameView(state, null);
  const confirmedIds = new Set(gameView.confirmedPlayerIds);

  return (state.players || []).map((p) => ({
    ...p,
    isActive: p.status !== "inactive",
    isConfirmed: confirmedIds.has(p.id),
    isInadimplente: !p.is_admin && p.role !== 'carne' && !p.mens_ok,
  }));
}
