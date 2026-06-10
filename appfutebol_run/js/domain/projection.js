
// PHASE 6 — PROJECTION LAYER
// Agora delega a contagem de confirmados ao módulo canônico
// (domain/confirmations.js), eliminando os contadores divergentes.

import { classifyGameConfirmations } from './confirmations.js';

export function getGameKey(game) {
  return String(game?.game_key || game?.id || (game?.game_date ? `game_${game.game_date}_${String(game.game_time || '').replace(/[^0-9]/g, '') || '0000'}` : 'default'));
}

export function getGames(state) {
  const legacy = state?.game && typeof state.game === 'object' ? state.game : null;
  const rawGames = Array.isArray(state?.games) ? state.games : [];
  const byKey = new Map();
  if (legacy) byKey.set(getGameKey(legacy), { ...legacy, id: legacy.id || getGameKey(legacy), game_key: getGameKey(legacy) });
  rawGames.forEach((game) => {
    if (!game || typeof game !== 'object') return;
    byKey.set(getGameKey(game), { ...game, id: game.id || getGameKey(game), game_key: getGameKey(game) });
  });
  return [...byKey.values()].sort((a,b)=>String(a.game_date||'').localeCompare(String(b.game_date||'')) || String(a.game_time||'').localeCompare(String(b.game_time||'')));
}

export function getActiveGame(state) {
  const games = getGames(state);
  if (!games.length) return state?.game || {};
  const explicit = String(state?.active_game_id || state?.game?.game_key || '').trim();
  return games.find((g)=>String(g.id||g.game_key)===explicit || String(g.game_key)===explicit) || games[0];
}

function __legacyGameFromState(state) {
  const legacyGame = getActiveGame(state) || {};
  const activeGameKey = getGameKey(legacyGame);

  // Fonte única: uma so regra de confirmado/escopo/goleiro/carne.
  const classified = classifyGameConfirmations(state, activeGameKey);

  return {
    ...legacyGame,
    confirmedPlayerIds: classified.linePlayerIds,
    confirmedGoalkeeperIds: classified.goalkeeperIds,
    waitlistPlayerIds: classified.waitlistPlayerIds,
    maxPlayers: legacyGame.max_players || legacyGame.maxPlayers || 0,
  };
}

export function buildGameView(state, currentPlayerId) {
  const rawGame = __legacyGameFromState(state) || {};
  const players = Array.isArray(state.players) ? state.players : [];
  const playersById = Object.fromEntries(players.map((p) => [String(p.id), p]));

  const confirmedPlayerIds = Array.isArray(rawGame.confirmedPlayerIds) ? rawGame.confirmedPlayerIds.map(String) : [];
  const confirmedGoalkeeperIds = Array.isArray(rawGame.confirmedGoalkeeperIds) ? rawGame.confirmedGoalkeeperIds.map(String) : [];
  const waitlistPlayerIds = Array.isArray(rawGame.waitlistPlayerIds) ? rawGame.waitlistPlayerIds.map(String) : [];

  const confirmed = confirmedPlayerIds.map((id) => playersById[id]).filter(Boolean);
  const confirmedGoalkeepers = confirmedGoalkeeperIds.map((id) => playersById[id]).filter(Boolean);
  const waitlist = waitlistPlayerIds.map((id) => playersById[id]).filter(Boolean);

  const currentId = currentPlayerId != null ? String(currentPlayerId) : null;
  const isConfirmed = !!currentId && confirmedPlayerIds.includes(currentId);
  const isWaitlisted = !!currentId && waitlistPlayerIds.includes(currentId);
  const waitlistPosition = isWaitlisted ? waitlistPlayerIds.indexOf(currentId) + 1 : null;

  const maxPlayers = rawGame.maxPlayers || rawGame.max_players || 0;
  const spotsLeft = Math.max(0, maxPlayers - confirmed.length);

  return {
    game: rawGame,
    games: getGames(state),
    activeGameId: rawGame.id || rawGame.game_key || null,
    confirmed,
    confirmedGoalkeepers,
    confirmedCount: confirmed.length,
    confirmedGoalkeeperCount: confirmedGoalkeepers.length,
    totalConfirmedCount: confirmed.length + confirmedGoalkeepers.length,
    confirmedPlayerIds,
    confirmedGoalkeeperIds,
    waitlist,
    waitlistPlayerIds,
    isConfirmed,
    isWaitlisted,
    waitlistPosition,
    spotsLeft,
    canConfirm: !isConfirmed && !isWaitlisted && spotsLeft > 0,
    canCancel: isConfirmed || isWaitlisted,
    maxPlayers
  };
}

export function buildPlayersView(state) {
  const gameView = buildGameView(state, null);
  const confirmedIds = new Set(gameView.confirmedPlayerIds.map(String));
  return (state.players || []).map((p) => ({ ...p, isActive: p.status !== 'inactive', isConfirmed: confirmedIds.has(String(p.id)), isInadimplente: (p.plays_football !== undefined ? p.plays_football : p.role !== 'carne') && !p.mens_ok }));
}
