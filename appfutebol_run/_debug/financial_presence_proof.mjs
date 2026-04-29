import { validateAndRepairState } from '../js/domain/state.guard.js';

const base = {
  session: { playerId: 'p_admin' },
  players: [
    { id: 'p_admin', name: 'Admin', phone: '48911111111', role: 'jogador', plays_football: true, mens_ok: true, is_admin: true },
    { id: 'p_lucas', name: 'Lucas', phone: '48922222222', role: 'jogador', plays_football: true, mens_ok: false, is_admin: false },
    { id: 'p_ok', name: 'Ok', phone: '48933333333', role: 'jogador', plays_football: true, mens_ok: true, is_admin: false },
  ],
  game: {
    open: true,
    max_players: 10,
    sort_result: {
      created_at: '2026-04-28T00:00:00.000Z',
      total_players: 2,
      team_a: ['p_lucas'],
      team_b: ['p_ok'],
    },
  },
  confirmations: [
    { player_id: 'p_lucas', confirmed: true, timestamp: '2026-04-28T00:00:00.000Z' },
    { player_id: 'p_ok', confirmed: true, timestamp: '2026-04-28T00:00:00.000Z' },
  ],
  championship: { ranking: [] },
  carne: [],
  notifications: [],
  ui: { currentTab: 'home', authMode: 'login', authMessage: null },
};

const repaired = validateAndRepairState(base).state;
const result = {
  lucasConfirmationCount: repaired.confirmations.filter((entry) => entry.player_id === 'p_lucas').length,
  lucasInTeamA: repaired.game.sort_result.team_a.includes('p_lucas'),
  lucasInTeamB: repaired.game.sort_result.team_b.includes('p_lucas'),
  okStillConfirmed: repaired.confirmations.some((entry) => entry.player_id === 'p_ok' && entry.confirmed),
  teamTotalPlayers: repaired.game.sort_result.total_players,
};

console.log(JSON.stringify(result, null, 2));
if (result.lucasConfirmationCount !== 0) process.exit(1);
if (result.lucasInTeamA || result.lucasInTeamB) process.exit(1);
if (!result.okStillConfirmed) process.exit(1);
if (result.teamTotalPlayers !== 1) process.exit(1);
