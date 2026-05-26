import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getState, patchState, replaceState } from '../core/state.js';
import { loadRemoteState } from './storage.supabase.js';
import { SUPABASE_CONFIG } from '../config/supabase.config.js';
import { normalizePhone } from '../domain/rules.engine.js';

const SESSION_KEY = 'harmonia_auth_session';
const TECHNICAL_EMAIL_DOMAIN = 'harmonia.app';

let supabasePasskeyClient = null;

function getSupabasePasskeyClient() {
  if (supabasePasskeyClient) return supabasePasskeyClient;

  supabasePasskeyClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      experimental: { passkey: true },
    },
  });

  return supabasePasskeyClient;
}

function isPasskeyRuntimeSupported() {
  return !!(
    window.PublicKeyCredential &&
    navigator.credentials &&
    window.isSecureContext
  );
}

function normalizeSupabaseJsSession(data) {
  return data?.session || data || null;
}


function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function authUrl(path) {
  return `${trimTrailingSlash(SUPABASE_CONFIG.url)}/auth/v1/${path}`;
}

function authHeaders(accessToken = null) {
  return {
    apikey: SUPABASE_CONFIG.anonKey,
    Authorization: `Bearer ${accessToken || SUPABASE_CONFIG.anonKey}`,
    'Content-Type': 'application/json',
  };
}

function saveSession(session) {
  if (!session?.access_token || !session?.user?.id) return null;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function loadStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
}

function isSessionExpired(session, skewSeconds = 60) {
  const expiresAt = Number(session?.expires_at || 0);
  if (!expiresAt) return false;
  return Math.floor(Date.now() / 1000) >= (expiresAt - skewSeconds);
}


export function isPasskeySupported() {
  return isPasskeyRuntimeSupported();
}

export async function prepareStoredSession() {
  const stored = loadStoredSession();

  if (!stored?.access_token) {
    return null;
  }

  if (!isSessionExpired(stored)) {
    return stored;
  }

  if (!stored.refresh_token) {
    clearStoredSession();
    return null;
  }

  const refreshed = await requestAuth('token?grant_type=refresh_token', {
    refresh_token: stored.refresh_token,
  });

  if (!refreshed.ok || !refreshed.data?.access_token) {
    clearStoredSession();
    return null;
  }

  return saveSession(refreshed.data);
}

async function requestAuth(path, payload, options = {}) {
  const response = await fetch(authUrl(path), {
    method: options.method || 'POST',
    headers: authHeaders(options.accessToken || null),
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data,
      message: data?.msg || data?.message || data?.error_description || data?.error || 'Falha de autenticação.',
    };
  }

  return { ok: true, status: response.status, data };
}

function normalizePosition(value) {
  return ['gol', 'zag', 'meia', 'atk'].includes(value) ? value : null;
}

function normalizeLoginPhone(value) {
  return normalizePhone(value);
}

function phoneToTechnicalEmail(phone) {
  const normalizedPhone = normalizeLoginPhone(phone);
  return `${normalizedPhone}@${TECHNICAL_EMAIL_DOMAIN}`;
}

function createPlayerId(players) {
  const max = (Array.isArray(players) ? players : []).reduce((acc, player) => {
    const current = Number(String(player.id || '').replace(/^p_?/, ''));
    return Number.isFinite(current) ? Math.max(acc, current) : acc;
  }, 0);
  return `p${Math.max(max + 1, Date.now())}`;
}

function findPlayerByAuthUserId(players, authUserId) {
  return (Array.isArray(players) ? players : []).find((item) => String(item.auth_user_id || '') === String(authUserId || '')) || null;
}

function ensureLoggedPlayer(session) {
  const snapshot = getState();
  const player = findPlayerByAuthUserId(snapshot.players, session?.user?.id);

  if (!player) {
    patchState({
      session: { playerId: null, authUserId: session?.user?.id || null },
      ui: {
        authMode: 'register',
        authMessage: {
          type: 'error',
          text: 'Login autenticado, mas nenhum jogador está vinculado a esse usuário. Cadastre o perfil com o mesmo telefone.',
        },
      },
    });
    return null;
  }

  patchState({
    session: { playerId: player.id, authUserId: session.user.id },
    ui: { authMessage: null, authMode: 'login', currentTab: 'home' },
  });

  return player;
}

export async function restoreSession() {
  const stored = await prepareStoredSession();
  if (!stored?.access_token) {
    patchState({ session: { playerId: null, authUserId: null } });
    return null;
  }

  const response = await fetch(authUrl('user'), {
    method: 'GET',
    headers: authHeaders(stored.access_token),
  });

  if (!response.ok) {
    clearStoredSession();
    patchState({ session: { playerId: null, authUserId: null } });
    return null;
  }

  const user = await response.json().catch(() => null);
  if (!user?.id) {
    clearStoredSession();
    patchState({ session: { playerId: null, authUserId: null } });
    return null;
  }

  const session = { ...stored, user };
  saveSession(session);

  const remote = await loadRemoteState().catch(() => null);
  if (remote?.ok && remote.state) {
    const current = getState();
    replaceState({
      ...remote.state,
      session: { playerId: null, authUserId: session.user.id },
      ui: current.ui,
    });
  }

  return ensureLoggedPlayer(session);
}

export function getCurrentPlayer() {
  const snapshot = getState();
  const stored = loadStoredSession();
  const authUserId = stored?.user?.id || snapshot.session?.authUserId || null;

  if (authUserId) {
    const byAuth = findPlayerByAuthUserId(snapshot.players, authUserId);
    if (byAuth) {
      if (snapshot.session?.playerId !== byAuth.id || snapshot.session?.authUserId !== authUserId) {
        patchState({ session: { playerId: byAuth.id, authUserId } });
      }
      return byAuth;
    }
  }

  return snapshot.players.find((item) => item.id === snapshot.session.playerId) || null;
}

export async function login(phone, password) {
  const normalizedPhone = normalizeLoginPhone(phone);
  const normalizedPassword = String(password || '').trim();

  if (normalizedPhone.length < 10 || normalizedPhone.length > 11 || !normalizedPassword) {
    return { ok: false, message: 'Informe telefone e senha.' };
  }

  const result = await requestAuth('token?grant_type=password', {
    email: phoneToTechnicalEmail(normalizedPhone),
    password: normalizedPassword,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const session = saveSession(result.data);

  const remote = await loadRemoteState().catch(() => null);
  if (remote?.ok && remote.state) {
    const current = getState();
    replaceState({
      ...remote.state,
      session: { playerId: null, authUserId: session.user.id },
      ui: current.ui,
    });
  }

  const player = ensureLoggedPlayer(session);
  if (!player) {
    return { ok: false, message: 'Usuário autenticado, mas ainda sem jogador vinculado.' };
  }

  return { ok: true, player };
}

export async function register(payload) {
  const snapshot = getState();
  const name = String(payload.name || '').trim();
  const phone = normalizeLoginPhone(payload.phone);
  const birthDate = String(payload.birthDate || '').trim();
  const role = payload.role === 'carne' ? 'carne' : 'player';
  const position = role === 'player' ? normalizePosition(payload.position) : null;
  const password = String(payload.password || '').trim();
  const passwordConfirm = String(payload.passwordConfirm || '').trim();
  const technicalEmail = phoneToTechnicalEmail(phone);

  if (!name) {
    return { ok: false, message: 'Informe o nome.' };
  }
  if (phone.length < 10 || phone.length > 11) {
    return { ok: false, message: 'Informe um telefone válido.' };
  }
  if (!birthDate) {
    return { ok: false, message: 'Informe a data de nascimento.' };
  }
  if (role === 'player' && !position) {
    return { ok: false, message: 'Selecione a posição em campo.' };
  }
  if (password.length < 6) {
    return { ok: false, message: 'A senha precisa ter pelo menos 6 caracteres.' };
  }
  if (password !== passwordConfirm) {
    return { ok: false, message: 'As senhas não conferem.' };
  }

  const duplicatePhone = snapshot.players.find((item) => normalizeLoginPhone(item.phone) === phone);
  if (duplicatePhone) {
    return { ok: false, message: 'Esse telefone já está cadastrado.' };
  }

  const authResult = await requestAuth('signup', {
    email: technicalEmail,
    password,
    data: { name, phone, birthDate, login_type: 'phone_password' },
  });

  if (!authResult.ok) {
    return { ok: false, message: authResult.message };
  }

  const authUser = authResult.data?.user;
  if (!authUser?.id) {
    return { ok: false, message: 'Cadastro criado, mas o Supabase não retornou o usuário.' };
  }

  const loginResult = await requestAuth('token?grant_type=password', {
    email: technicalEmail,
    password,
  });

  if (!loginResult.ok) {
    return {
      ok: false,
      message: `Cadastro criado, mas o login automático falhou: ${loginResult.message}`,
    };
  }

  const session = saveSession(loginResult.data);

  const remote = await loadRemoteState().catch(() => null);
  const baseSnapshot = remote?.ok && remote.state ? remote.state : snapshot;
  const basePlayers = Array.isArray(baseSnapshot.players) ? baseSnapshot.players : [];

  const remoteDuplicatePhone = basePlayers.find((item) => normalizeLoginPhone(item.phone) === phone);
  if (remoteDuplicatePhone) {
    replaceState({
      ...baseSnapshot,
      session: { playerId: null, authUserId: session.user.id },
      ui: {
        ...(baseSnapshot.ui || {}),
        authMode: 'login',
        authMessage: {
          type: 'error',
          text: 'Esse telefone já existe na base remota. Faça login ou peça ao administrador para conferir o cadastro.',
        },
      },
    });
    return { ok: false, message: 'Esse telefone já existe na base remota.' };
  }

  replaceState({
    ...baseSnapshot,
    session: { playerId: null, authUserId: session.user.id },
    ui: {
      ...(baseSnapshot.ui || {}),
      authMode: 'login',
      authMessage: {
        type: 'success',
        text: 'Cadastro realizado. Entrando automaticamente...',
      },
    },
  });

  const isFirstPlayer = basePlayers.length === 0;
  const nextPlayer = {
    id: createPlayerId(basePlayers),
    auth_user_id: authUser.id,
    email: technicalEmail,
    login_phone: phone,
    name,
    phone,
    birthDate,
    role,
    plays_football: role === 'player',
    in_carne_group: true,
    position,
    mens_ok: false,
    is_admin: isFirstPlayer,
  };

  patchState({
    players: [...basePlayers, nextPlayer],
    ui: {
      authMode: 'login',
      authMessage: {
        type: 'success',
        text: 'Cadastro realizado. Entrando automaticamente...',
      },
    },
  });

  const loggedPlayer = ensureLoggedPlayer(session);

  if (!loggedPlayer) {
    return { ok: false, message: 'Cadastro criado, mas o jogador ainda não ficou vinculado à sessão.' };
  }

  return { ok: true, player: loggedPlayer };
}


export async function registerCurrentUserPasskey() {
  const stored = await prepareStoredSession();

  if (!stored?.access_token || !stored?.refresh_token || !stored?.user?.id) {
    return { ok: false, message: 'Faça login com telefone e senha antes de ativar o acesso por biometria.' };
  }

  if (!isPasskeyRuntimeSupported()) {
    return { ok: false, message: 'Este aparelho/navegador não suporta passkeys/WebAuthn neste contexto.' };
  }

  const client = getSupabasePasskeyClient();

  const setSessionResult = await client.auth.setSession({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
  });

  if (setSessionResult.error) {
    return { ok: false, message: setSessionResult.error.message || 'Não foi possível preparar a sessão para passkey.' };
  }

  const currentPlayer = getCurrentPlayer();
  const friendlyName = `Harmonia FC - ${currentPlayer?.name || 'Jogador'}`;

  const result = await client.auth.registerPasskey({
    friendlyName,
  });

  if (result.error) {
    return { ok: false, message: result.error.message || 'Não foi possível ativar a biometria neste aparelho.' };
  }

  localStorage.setItem('harmonia_passkey_enabled', '1');
  return { ok: true };
}

export async function signInWithPasskey() {
  if (!isPasskeyRuntimeSupported()) {
    return { ok: false, message: 'Este aparelho/navegador não suporta passkeys/WebAuthn neste contexto.' };
  }

  const client = getSupabasePasskeyClient();
  const result = await client.auth.signInWithPasskey();

  if (result.error) {
    return { ok: false, message: result.error.message || 'Não foi possível entrar com biometria.' };
  }

  const session = normalizeSupabaseJsSession(result.data);

  if (!session?.access_token || !session?.user?.id) {
    return { ok: false, message: 'A autenticação por biometria não retornou sessão válida.' };
  }

  saveSession(session);

  const remote = await loadRemoteState().catch(() => null);
  if (remote?.ok && remote.state) {
    const current = getState();
    replaceState({
      ...remote.state,
      session: { playerId: null, authUserId: session.user.id },
      ui: current.ui,
    });
  }

  const player = ensureLoggedPlayer(session);
  if (!player) {
    return { ok: false, message: 'Biometria autenticada, mas nenhum jogador está vinculado a esse usuário.' };
  }

  localStorage.setItem('harmonia_passkey_enabled', '1');
  return { ok: true, player };
}

export async function logout() {
  const stored = loadStoredSession();
  if (stored?.access_token) {
    await requestAuth('logout', undefined, { method: 'POST', accessToken: stored.access_token }).catch(() => null);
  }

  clearStoredSession();
  patchState({
    session: { playerId: null, authUserId: null },
    ui: { authMessage: null, authMode: 'login', currentTab: 'home' },
  });
}
