const listeners = new Set();

export const state = {
  session: {
    playerId: null,
  },
  players: [],
  game: null,
  confirmations: [],
  championship: null,
  carne: [],
  notifications: [],
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
  state.session = {
    ...state.session,
    ...(nextState.session || {}),
  };
  state.players = Array.isArray(nextState.players) ? nextState.players : [];
  state.game = nextState.game || null;
  state.confirmations = Array.isArray(nextState.confirmations) ? nextState.confirmations : [];
  state.championship = nextState.championship || null;
  state.carne = Array.isArray(nextState.carne) ? nextState.carne : [];
  state.notifications = Array.isArray(nextState.notifications) ? nextState.notifications : [];
  state.ui = {
    ...state.ui,
    ...(nextState.ui || {}),
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
  if (Object.prototype.hasOwnProperty.call(patch, 'confirmations')) {
    state.confirmations = Array.isArray(patch.confirmations) ? patch.confirmations : [];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'championship')) {
    state.championship = patch.championship || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'carne')) {
    state.carne = Array.isArray(patch.carne) ? patch.carne : [];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'notifications')) {
    state.notifications = Array.isArray(patch.notifications) ? patch.notifications : [];
  }

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
