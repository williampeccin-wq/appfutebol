import { getActiveGame, getGameKey } from './projection.js';

function isGoalkeeper(player) {
  const raw = String(player?.position || '').trim().toLowerCase();
  return raw === 'gol' || raw === 'goleiro';
}

function isWaitlistEntry(entry) {
  return !!entry && entry.confirmed !== true && (entry.status === 'waitlist' || entry.status === 'waitlisted');
}

export function auditPresenceProjection(snapshot = {}) {
  const game = getActiveGame(snapshot);
  const gameKey = getGameKey(game);
  const playersById = new Map((snapshot.players || []).map((player) => [String(player.id), player]));
  const scoped = (snapshot.confirmations || []).filter((entry) => String(entry?.game_key || '') === String(gameKey));

  const confirmed = scoped.filter((entry) => entry?.confirmed === true);
  const goalkeepers = confirmed.filter((entry) => isGoalkeeper(playersById.get(String(entry.player_id))));
  const line = confirmed.filter((entry) => !isGoalkeeper(playersById.get(String(entry.player_id))));
  const waitlist = scoped.filter(isWaitlistEntry);

  return {
    game_key: gameKey,
    max_line_players: Number(game?.max_players || 0),
    confirmed_total: confirmed.length,
    confirmed_line: line.length,
    confirmed_goalkeepers: goalkeepers.length,
    waitlist: waitlist.length,
    orphan_confirmations: scoped
      .filter((entry) => !playersById.has(String(entry.player_id)))
      .map((entry) => entry.player_id),
    unscoped_confirmations: (snapshot.confirmations || [])
      .filter((entry) => !entry?.game_key)
      .map((entry) => entry.player_id),
  };
}
