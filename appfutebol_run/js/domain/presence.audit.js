import { getActiveGame, getGameKey } from './projection.js';
import { classifyGameConfirmations, isConfirmedEntry, isWaitlistEntry } from './confirmations.js';

// Oraculo de teste: usa a MESMA fonte unica das telas (classifyGameConfirmations),
// e adiciona diagnosticos uteis (orfaos e confirmacoes sem game_key).
export function auditPresenceProjection(snapshot = {}) {
  const game = getActiveGame(snapshot);
  const gameKey = getGameKey(game);
  const playersById = new Map((snapshot.players || []).map((player) => [String(player.id), player]));

  const classified = classifyGameConfirmations(snapshot, gameKey);

  const scoped = (snapshot.confirmations || []).filter(
    (entry) => String((entry && entry.game_key) || gameKey) === String(gameKey)
  );

  return {
    game_key: gameKey,
    max_line_players: Number(game?.max_players || 0),
    confirmed_line: classified.lineCount,
    confirmed_goalkeepers: classified.goalkeeperCount,
    confirmed_total: classified.lineCount + classified.goalkeeperCount,
    waitlist: classified.waitlistCount,
    // Diagnosticos: estes deveriam estar vazios em uma base saudavel.
    orphan_confirmations: scoped
      .filter((entry) => isConfirmedEntry(entry) || isWaitlistEntry(entry))
      .filter((entry) => !playersById.has(String(entry.player_id)))
      .map((entry) => entry.player_id),
    unscoped_confirmations: (snapshot.confirmations || [])
      .filter((entry) => !entry || !entry.game_key)
      .map((entry) => entry && entry.player_id),
  };
}
