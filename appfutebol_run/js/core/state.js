import { validateAndRepairState } from '../domain/state.guard.js';

const listeners = new Set();

export const state = {
  session: {
    playerId: null,
  },
  players: [],
  game: null,
  games: [],
  active_game_id: null,
  confirmations: [],
  championship: null,
  carne: [],
  notifications: [],
  // Configurações globais do clube (não por jogo). Ex.: vencimento único da mensalidade.
  settings: { mens_expire_date: '' },
  deleted_player_ids: [],
  deleted_player_phones: [],
  ui: {
    currentTab: 'home',
    authMode: 'login',
    authMessage: null,
  },
};

export function getState() {
  return structuredClone(state);
}

export function replaceState(nextState) {
  const repaired = validateAndRepairState(nextState);
  const safeState = repaired.state;

  if (repaired.warnings.length) {
    console.warn('[state] Reparos aplicados no replaceState:', repaired.warnings);
  }

  state.session = {
    ...state.session,
    ...(safeState.session || {}),
  };
  state.players = Array.isArray(safeState.players) ? safeState.players : [];
  state.game = safeState.game || null;
  state.games = Array.isArray(safeState.games) ? safeState.games : [];
  state.active_game_id = safeState.active_game_id || null;
  state.confirmations = Array.isArray(safeState.confirmations) ? safeState.confirmations : [];
  state.championship = safeState.championship || null;
  state.carne = Array.isArray(safeState.carne) ? safeState.carne : [];
  state.notifications = Array.isArray(safeState.notifications) ? safeState.notifications : [];
  state.settings = (safeState.settings && typeof safeState.settings === 'object') ? { ...safeState.settings } : { mens_expire_date: '' };
  state.deleted_player_ids = Array.isArray(safeState.deleted_player_ids) ? safeState.deleted_player_ids.map((id) => String(id)).filter(Boolean) : [];
  state.deleted_player_phones = Array.isArray(safeState.deleted_player_phones) ? safeState.deleted_player_phones.map((phone) => String(phone || '').replace(/\D/g, '')).filter(Boolean) : [];
  state.ui = {
    ...state.ui,
    ...(safeState.ui || {}),
  };

  emitChange();
}

export function patchState(patch) {
  if (patch.session) {
    state.session = { ...state.session, ...patch.session };
  }
  if (patch.ui) {
    state.ui = { ...state.ui, ...patch.ui };
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'players')) {
    state.players = Array.isArray(patch.players) ? patch.players : [];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'game')) {
    state.game = patch.game || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'games')) {
    state.games = Array.isArray(patch.games) ? patch.games : [];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'active_game_id')) {
    state.active_game_id = patch.active_game_id || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'confirmations')) {
    state.confirmations = Array.isArray(patch.confirmations) ? patch.confirmations : [];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'championship')) {
    state.championship = patch.championship || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'deleted_player_ids')) {
    state.deleted_player_ids = Array.isArray(patch.deleted_player_ids) ? patch.deleted_player_ids.map((id) => String(id)).filter(Boolean) : [];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'deleted_player_phones')) {
    state.deleted_player_phones = Array.isArray(patch.deleted_player_phones) ? patch.deleted_player_phones.map((phone) => String(phone || '').replace(/\D/g, '')).filter(Boolean) : [];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'carne')) {
    state.carne = Array.isArray(patch.carne) ? patch.carne : [];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'notifications')) {
    state.notifications = Array.isArray(patch.notifications) ? patch.notifications : [];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'settings')) {
    state.settings = { ...(state.settings || {}), ...(patch.settings || {}) };
  }

  const repaired = validateAndRepairState(state);
  if (repaired.warnings.length) {
    console.warn('[state] Reparos aplicados no patchState:', repaired.warnings);
  }

  state.session = repaired.state.session || state.session;
  state.players = Array.isArray(repaired.state.players) ? repaired.state.players : [];
  state.game = repaired.state.game || null;
  state.games = Array.isArray(repaired.state.games) ? repaired.state.games : [];
  state.active_game_id = repaired.state.active_game_id || null;
  state.confirmations = Array.isArray(repaired.state.confirmations) ? repaired.state.confirmations : [];
  state.championship = repaired.state.championship || null;
  state.carne = Array.isArray(repaired.state.carne) ? repaired.state.carne : [];
  state.notifications = Array.isArray(repaired.state.notifications) ? repaired.state.notifications : [];
  state.settings = (repaired.state.settings && typeof repaired.state.settings === 'object') ? { ...repaired.state.settings } : (state.settings || { mens_expire_date: '' });
  state.deleted_player_ids = Array.isArray(repaired.state.deleted_player_ids) ? repaired.state.deleted_player_ids.map((id) => String(id)).filter(Boolean) : [];
  state.deleted_player_phones = Array.isArray(repaired.state.deleted_player_phones) ? repaired.state.deleted_player_phones.map((phone) => String(phone || '').replace(/\D/g, '')).filter(Boolean) : [];
  state.ui = repaired.state.ui || state.ui;

  emitChange();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  const snapshot = getState();
  listeners.forEach((listener) => listener(snapshot));
}
