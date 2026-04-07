import { getState, patchState } from '../core/state.js';

const SESSION_KEY = 'harmonia_session_player_id';

export function restoreSession() {
  const sessionPlayerId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionPlayerId) {
    patchState({ session: { playerId: null } });
    return null;
  }

  const snapshot = getState();
  const player = snapshot.players.find((item) => item.id === sessionPlayerId);
  if (!player) {
    sessionStorage.removeItem(SESSION_KEY);
    patchState({ session: { playerId: null } });
    return null;
  }

  patchState({ session: { playerId: player.id } });
  return player;
}

export function getCurrentPlayer() {
  const snapshot = getState();
  return snapshot.players.find((item) => item.id === snapshot.session.playerId) || null;
}

export function login(phone, password) {
  const cleanPhone = normalizePhone(phone);
  const normalizedPassword = String(password || '').trim();

  if (!cleanPhone || !normalizedPassword) {
    return { ok: false, message: 'Informe telefone e senha.' };
  }

  const snapshot = getState();
  const player = snapshot.players.find((item) => normalizePhone(item.phone) === cleanPhone);

  if (!player) {
    return { ok: false, message: 'Telefone não cadastrado.' };
  }

  if (String((player.password_hash || player.password) || '') !== normalizedPassword) {
    return { ok: false, message: 'Senha inválida.' };
  }

  sessionStorage.setItem(SESSION_KEY, player.id);
  patchState({
    session: { playerId: player.id },
    ui: { authMessage: null, authMode: 'login', currentTab: 'home' },
  });

  return { ok: true, player };
}

export function register(payload) {
  const snapshot = getState();
  const name = String(payload.name || '').trim();
  const phone = normalizePhone(payload.phone);
  const birthDate = String(payload.birthDate || '').trim();
  const role = payload.role === 'carne' ? 'carne' : 'jogador';
  const position = role === 'jogador' ? normalizePosition(payload.position) : null;
  const password = String(payload.password || '').trim();
  const passwordConfirm = String(payload.passwordConfirm || '').trim();

  if (!name) {
    return { ok: false, message: 'Informe o nome.' };
  }
  if (phone.length < 10 || phone.length > 11) {
    return { ok: false, message: 'Informe um telefone válido.' };
  }
  if (!birthDate) {
    return { ok: false, message: 'Informe a data de nascimento.' };
  }
  if (role === 'jogador' && !position) {
    return { ok: false, message: 'Selecione a posição em campo.' };
  }
  if (!password) {
    return { ok: false, message: 'Informe a senha.' };
  }
  if (password !== passwordConfirm) {
    return { ok: false, message: 'As senhas não conferem.' };
  }

  const duplicate = snapshot.players.find((item) => normalizePhone(item.phone) === phone);
  if (duplicate) {
    return { ok: false, message: 'Esse telefone já está cadastrado.' };
  }

  const nextPlayer = {
    id: createPlayerId(snapshot.players),
    name,
    phone,
    birthDate,
    role,
    position,
    mens_ok: false,
    is_admin: false,
    password_hash: password,
  };

  patchState({
    players: [...snapshot.players, nextPlayer],
    ui: {
      authMode: 'login',
      authMessage: {
        type: 'success',
        text: 'Cadastro realizado com sucesso. Faça seu login.',
      },
    },
  });

  return { ok: true, player: nextPlayer };
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  patchState({
    session: { playerId: null },
    ui: { authMessage: null, authMode: 'login', currentTab: 'home' },
  });
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePosition(value) {
  return ['zag', 'meia', 'atk'].includes(value) ? value : null;
}

function createPlayerId(players) {
  const max = players.reduce((acc, player) => {
    const current = Number(String(player.id || '').replace(/^p/, ''));
    return Number.isFinite(current) ? Math.max(acc, current) : acc;
  }, 0);
  return `p${max + 1}`;
}
