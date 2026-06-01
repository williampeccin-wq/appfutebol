import { SUPABASE_CONFIG } from '../config/supabase.config.js';

let lastRemoteUpdatedAt = null;
let lastSplitSnapshot = null;
let lastSplitFingerprint = '';

const SPLIT_TABLES = {
  players: 'players',
  game: 'game_state',
  presence: 'presence_confirmations',
  meta: 'app_meta',
};

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function getConfig() {
  const runtimeConfig = window.HARMONIA_SUPABASE || {};
  return {
    ...SUPABASE_CONFIG,
    ...runtimeConfig,
  };
}

export function isSupabaseConfigured() {
  const config = getConfig();
  return !!(config.enabled && config.url && config.anonKey && config.stateTable && config.stateKey);
}

function baseUrl(config) {
  return trimTrailingSlash(config.url);
}

function tableUrl(config, table, query = '') {
  const suffix = query ? `?${query}` : '';
  return `${baseUrl(config)}/rest/v1/${encodeURIComponent(table)}${suffix}`;
}

function getAuthSession() {
  try {
    const raw = localStorage.getItem('harmonia_auth_session');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function getAccessToken() {
  return getAuthSession()?.access_token || null;
}

function getCurrentAuthUserId() {
  return getAuthSession()?.user?.id || null;
}

function buildHeaders(config, prefer = null) {
  const accessToken = getAccessToken();

  const headers = {
    apikey: config.anonKey,
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

function isValidSplitState(state) {
  return !!(
    state &&
    typeof state === 'object' &&
    Array.isArray(state.players) &&
    state.game &&
    typeof state.game === 'object' &&
    Array.isArray(state.confirmations)
  );
}

function composeState({ players = [], game = null, confirmations = [], meta = {} }) {
  return {
    session: { playerId: null },
    players,
    game: normalizeGameForPresenceCutover(game),
    confirmations,
    championship: meta.championship || null,
    carne: Array.isArray(meta.carne) ? meta.carne : [],
    notifications: Array.isArray(meta.notifications) ? meta.notifications : [],
    ui: {
      currentTab: 'home',
      authMode: 'login',
      authMessage: null,
    },
  };
}

function splitState(state) {
  return {
    players: Array.isArray(state.players) ? state.players : [],
    game: normalizeGameForPresenceCutover(state.game || null),
    confirmations: Array.isArray(state.confirmations) ? state.confirmations : [],
    meta: {
      championship: state.championship || null,
      carne: Array.isArray(state.carne) ? state.carne : [],
      notifications: Array.isArray(state.notifications) ? state.notifications : [],
    },
  };
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  return JSON.stringify(value ?? null);
}

function snapshotFingerprint(parts) {
  return stableStringify({
    players: parts.players,
    game: parts.game,
    confirmations: parts.confirmations,
    meta: parts.meta,
  });
}

function indexBy(items, keyGetter) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = keyGetter(item);
    if (key) map.set(String(key), item);
  }
  return map;
}

function buildGameKeyFromGame(game) {
  const date = String(game?.game_date || '').trim();
  const time = String(game?.game_time || '').trim();

  if (!date) return 'default';

  const safeDate = date.replace(/[^0-9-]/g, '');
  const safeTime = time.replace(/[^0-9]/g, '') || '0000';

  return `game_${safeDate}_${safeTime}`;
}

function getActiveGameKey(game) {
  const explicit = String(game?.game_key || '').trim();
  return explicit || buildGameKeyFromGame(game);
}

function normalizeConfirmationGameKey(confirmation, fallbackGameKey) {
  return String(confirmation?.game_key || fallbackGameKey || 'default');
}

function normalizeGameForPresenceCutover(game) {
  if (!game || typeof game !== 'object') return game || null;

  const nextGame = cloneJson(game) || {};

  delete nextGame.confirmedPlayers;
  delete nextGame.confirmed_players;
  delete nextGame.confirmations;

  if (nextGame.data && typeof nextGame.data === 'object') {
    delete nextGame.data.confirmedPlayers;
    delete nextGame.data.confirmed_players;
    delete nextGame.data.confirmations;
  }

  nextGame.game_key = getActiveGameKey(nextGame);

  return nextGame;
}

function confirmationFromPresenceRow(row) {
  if (!row || typeof row !== 'object') return null;

  const data = row.data && typeof row.data === 'object' ? row.data : {};
  const dataStatus = String(data.status || '').toLowerCase();
  const rowStatus = String(row.status || '').toLowerCase();
  const status = (dataStatus === 'waitlist' || dataStatus === 'waitlisted') ? dataStatus : (rowStatus || dataStatus);
  const confirmed = status ? status === 'confirmed' : data.confirmed === true;
  const timestamp = data.waitlisted_at || data.timestamp || row.confirmed_at || row.cancelled_at || row.updated_at || null;

  return {
    ...data,
    game_key: row.game_key || data.game_key || 'default',
    player_id: row.player_id || data.player_id,
    confirmed,
    status: status || (confirmed ? 'confirmed' : 'cancelled'),
    timestamp,
    confirmed_at: row.confirmed_at || data.confirmed_at || null,
    cancelled_at: row.cancelled_at || data.cancelled_at || null,
    waitlisted_at: data.waitlisted_at || null,
    waitlist_position: data.waitlist_position || null,
    removed_by_admin: row.removed_by_admin === true || data.removed_by_admin === true,
    source: 'presence_confirmations',
  };
}

function presencePayloadFromConfirmation(confirmation, now, gameKey = 'default') {
  const confirmed = confirmation?.confirmed === true;
  const removedByAdmin = confirmation?.removed_by_admin === true;
  const requestedStatus = String(confirmation?.status || '').toLowerCase();
  const isWaitlist = !confirmed && (requestedStatus === 'waitlist' || requestedStatus === 'waitlisted');
  const status = confirmed ? 'confirmed' : (removedByAdmin ? 'removed' : (isWaitlist ? 'waitlist' : 'cancelled'));
  const timestamp = confirmation?.timestamp || confirmation?.waitlisted_at || now;
  const actorAuthUserId = getCurrentAuthUserId();
  const normalizedGameKey = normalizeConfirmationGameKey(confirmation, gameKey);

  const normalizedPayload = {
    player_id: String(confirmation.player_id),
    game_key: normalizedGameKey,
    confirmed,
    status,
    timestamp,
    confirmed_at: confirmed ? timestamp : null,
    cancelled_at: (!confirmed && !removedByAdmin && !isWaitlist) ? timestamp : null,
    waitlisted_at: isWaitlist ? (confirmation?.waitlisted_at || timestamp) : null,
    waitlist_position: isWaitlist ? (confirmation?.waitlist_position || null) : null,
    removed_by_admin: removedByAdmin,
    source: 'presence_confirmations_app_write',
    actor_auth_user_id: actorAuthUserId,
  };

  return {
    game_key: normalizedGameKey,
    player_id: String(confirmation.player_id),
    status: status === 'waitlist' ? 'cancelled' : status,
    confirmed_at: normalizedPayload.confirmed_at,
    cancelled_at: normalizedPayload.cancelled_at,
    removed_by_admin: removedByAdmin,
    created_by_auth_user_id: actorAuthUserId,
    data: normalizedPayload,
    updated_at: now,
  };
}

function rememberSplitSnapshot(state, updatedAt = null) {
  const parts = splitState(state);
  lastSplitSnapshot = cloneJson(parts);
  lastSplitFingerprint = snapshotFingerprint(parts);
  lastRemoteUpdatedAt = updatedAt || lastRemoteUpdatedAt;
}

async function requestJson(config, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(config, options.prefer || null),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      status: response.status,
      body,
      data: null,
    };
  }

  const data = await response.json().catch(() => null);
  return {
    ok: true,
    status: response.status,
    body: '',
    data,
  };
}

async function requestNoContent(config, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(config, options.prefer || null),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      status: response.status,
      body,
    };
  }

  return {
    ok: true,
    status: response.status,
    body: '',
  };
}

async function loadSplitState(config) {
  const [playersResult, gameResult, metaResult] = await Promise.all([
    requestJson(config, tableUrl(config, SPLIT_TABLES.players, 'select=id,auth_user_id,is_admin,data,updated_at&order=data->>name.asc'), { method: 'GET' }),
    requestJson(config, tableUrl(config, SPLIT_TABLES.game, 'key=eq.default&select=key,data,updated_at&limit=1'), { method: 'GET' }),
    requestJson(config, tableUrl(config, SPLIT_TABLES.meta, 'key=eq.default&select=key,data,updated_at&limit=1'), { method: 'GET' }),
  ]);

  if (!playersResult.ok || !gameResult.ok || !metaResult.ok) {
    return {
      ok: false,
      state: null,
      updatedAt: null,
      reason: 'single_source_tables_unavailable',
    };
  }

  const players = Array.isArray(playersResult.data)
    ? playersResult.data
        .map((row) => ({
          ...(row.data || {}),
          id: row.id || row.data?.id,
          auth_user_id: row.auth_user_id || row.data?.auth_user_id || null,
          is_admin: row.is_admin === true,
        }))
        .filter((player) => player.id)
    : [];

  const gameRow = Array.isArray(gameResult.data) ? gameResult.data[0] : null;
  const normalizedGame = normalizeGameForPresenceCutover(gameRow?.data || null);
  const activeGameKey = getActiveGameKey(normalizedGame);

  const presenceResult = await requestJson(
    config,
    tableUrl(config, SPLIT_TABLES.presence, `game_key=eq.${encodeURIComponent(activeGameKey)}&select=game_key,player_id,status,confirmed_at,cancelled_at,removed_by_admin,data,updated_at`),
    { method: 'GET' }
  );

  if (!presenceResult.ok) {
    return {
      ok: false,
      state: null,
      updatedAt: null,
      reason: 'single_source_presence_unavailable',
    };
  }

  const confirmations = Array.isArray(presenceResult.data)
    ? presenceResult.data.map(confirmationFromPresenceRow).filter((entry) => entry?.player_id)
    : [];

  const metaRow = Array.isArray(metaResult.data) ? metaResult.data[0] : null;

  const state = composeState({
    players,
    game: normalizedGame,
    confirmations,
    meta: metaRow?.data || {},
  });

  const updatedValues = [
    ...(Array.isArray(playersResult.data) ? playersResult.data.map((row) => row.updated_at) : []),
    ...(Array.isArray(presenceResult.data) ? presenceResult.data.map((row) => row.updated_at) : []),
    gameRow?.updated_at,
    metaRow?.updated_at,
  ].filter(Boolean).sort();

  lastRemoteUpdatedAt = updatedValues.length ? updatedValues[updatedValues.length - 1] : null;

  if (!isValidSplitState(state)) {
    return {
      ok: false,
      state,
      updatedAt: lastRemoteUpdatedAt,
      reason: 'single_source_state_empty_or_invalid',
    };
  }

  rememberSplitSnapshot(state, lastRemoteUpdatedAt);

  return {
    ok: true,
    state,
    updatedAt: lastRemoteUpdatedAt,
    reason: 'presence_single_source_loaded_by_game_key',
    mode: 'presence-single-source-game-key',
  };
}

async function upsertRow(config, table, payload, onConflict = null) {
  const query = onConflict ? `on_conflict=${encodeURIComponent(onConflict)}` : '';
  return await requestJson(config, tableUrl(config, table, query), {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: JSON.stringify(payload),
  });
}

async function upsertPresenceConfirmation(config, confirmation, now, gameKey) {
  const payload = presencePayloadFromConfirmation(confirmation, now, gameKey);
  const result = await upsertRow(config, SPLIT_TABLES.presence, payload, 'game_key,player_id');

  if (!result.ok) {
    console.warn('[presence] Falha ao gravar em presence_confirmations:', result.status, result.body);
  }

  return result;
}

async function deleteRow(config, table, column, value) {
  return await requestNoContent(config, tableUrl(config, table, `${column}=eq.${encodeURIComponent(String(value))}`), {
    method: 'DELETE',
  });
}

function buildGranularOperations(config, previousParts, nextParts, now) {
  const operations = [];
  const previousPlayers = indexBy(previousParts?.players || [], (player) => player.id);
  const nextPlayers = indexBy(nextParts.players, (player) => player.id);

  const previousGameKey = getActiveGameKey(previousParts?.game || null);
  const nextGameKey = getActiveGameKey(nextParts.game || null);

  const previousConfirmations = indexBy(previousParts?.confirmations || [], (entry) => entry.player_id);
  const nextConfirmations = indexBy(nextParts.confirmations, (entry) => entry.player_id);

  for (const [id, player] of nextPlayers.entries()) {
    if (stableStringify(previousPlayers.get(id)) !== stableStringify(player)) {
      const authUserId = player.auth_user_id || null;
      const isAdmin = player.is_admin === true;
      operations.push({
        type: 'upsert_player',
        run: () => upsertRow(config, SPLIT_TABLES.players, {
          id,
          auth_user_id: authUserId,
          is_admin: isAdmin,
          data: {
            ...player,
            id,
            auth_user_id: authUserId,
            is_admin: isAdmin,
          },
          updated_at: now,
        }),
      });
    }
  }

  for (const id of previousPlayers.keys()) {
    if (!nextPlayers.has(id)) {
      operations.push({
        type: 'delete_player',
        run: () => deleteRow(config, SPLIT_TABLES.players, 'id', id),
      });
    }
  }

  if (previousGameKey !== nextGameKey) {
    operations.push({
      type: 'delete_previous_game_presence_confirmations',
      run: () => requestNoContent(
        config,
        tableUrl(config, SPLIT_TABLES.presence, `game_key=eq.${encodeURIComponent(previousGameKey)}`),
        { method: 'DELETE' }
      ),
    });
  }

  for (const [playerId, confirmation] of nextConfirmations.entries()) {
    const normalizedConfirmation = {
      ...confirmation,
      game_key: nextGameKey,
    };

    if (
      previousGameKey !== nextGameKey ||
      stableStringify(previousConfirmations.get(playerId)) !== stableStringify(normalizedConfirmation)
    ) {
      operations.push({
        type: 'upsert_presence_confirmation',
        run: () => upsertPresenceConfirmation(config, normalizedConfirmation, now, nextGameKey),
      });
    }
  }

  for (const playerId of previousConfirmations.keys()) {
    if (!nextConfirmations.has(playerId)) {
      operations.push({
        type: 'delete_presence_confirmation',
        run: () => requestNoContent(
          config,
          tableUrl(config, SPLIT_TABLES.presence, `game_key=eq.${encodeURIComponent(previousGameKey)}&player_id=eq.${encodeURIComponent(String(playerId))}`),
          { method: 'DELETE' }
        ),
      });
    }
  }

  if (stableStringify(previousParts?.game || null) !== stableStringify(nextParts.game || null)) {
    operations.push({
      type: 'upsert_game',
      run: () => upsertRow(config, SPLIT_TABLES.game, { key: 'default', data: nextParts.game, updated_at: now }),
    });
  }

  if (stableStringify(previousParts?.meta || {}) !== stableStringify(nextParts.meta || {})) {
    operations.push({
      type: 'upsert_meta',
      run: () => upsertRow(config, SPLIT_TABLES.meta, { key: 'default', data: nextParts.meta, updated_at: now }),
    });
  }

  return operations;
}

async function saveSplitState(config, state) {
  const parts = splitState(state);

  if (!parts.game) {
    return { ok: false, conflict: false, reason: 'split_save_invalid_state' };
  }

  const nextFingerprint = snapshotFingerprint(parts);

  if (lastSplitFingerprint && nextFingerprint === lastSplitFingerprint) {
    return { ok: true, conflict: false, reason: 'split_no_changes', updatedAt: lastRemoteUpdatedAt };
  }

  const now = new Date().toISOString();
  const previousParts = lastSplitSnapshot || { players: [], game: null, confirmations: [], meta: {} };
  const operations = buildGranularOperations(config, previousParts, parts, now);

  if (!operations.length) {
    rememberSplitSnapshot(state, lastRemoteUpdatedAt || now);
    return { ok: true, conflict: false, reason: 'split_no_changes', updatedAt: lastRemoteUpdatedAt };
  }

  const results = await Promise.all(operations.map((operation) => operation.run()));
  const failed = results.find((result) => !result.ok);

  if (failed) {
    return { ok: false, conflict: false, reason: `split_granular_save_failed_${failed.status}` };
  }

  rememberSplitSnapshot(state, now);

  return {
    ok: true,
    conflict: false,
    reason: 'split_granular_saved',
    updatedAt: now,
    operations: operations.map((operation) => operation.type),
  };
}

export function getLastRemoteUpdatedAt() {
  return lastRemoteUpdatedAt;
}

export function setLastRemoteUpdatedAt(value) {
  lastRemoteUpdatedAt = value || null;
}

export async function loadRemoteState() {
  const config = getConfig();

  if (!isSupabaseConfigured()) {
    return { ok: false, state: null, updatedAt: null, reason: 'supabase_not_configured' };
  }

  try {
    return await loadSplitState(config);
  } catch (error) {
    console.warn('[storage.supabase] load failed; presence_confirmations single source is unavailable', error);
    return { ok: false, state: null, updatedAt: null, reason: 'single_source_load_exception' };
  }
}

export async function saveRemoteState(state, _options = {}) {
  const config = getConfig();

  if (!isSupabaseConfigured()) {
    return { ok: false, conflict: false, reason: 'supabase_not_configured' };
  }

  try {
    return await saveSplitState(config, state);
  } catch (error) {
    console.warn('[storage.supabase] save failed; local storage remains available', error);
    return { ok: false, conflict: false, reason: 'single_source_save_exception' };
  }
}

export function getSupabaseMeta() {
  const config = getConfig();
  return {
    enabled: !!config.enabled,
    configured: isSupabaseConfigured(),
    url: config.url ? trimTrailingSlash(config.url) : '',
    table: config.stateTable,
    key: config.stateKey,
    lastRemoteUpdatedAt,
    splitTables: SPLIT_TABLES,
    granularWrites: true,
    presenceNormalization: true,
    presenceReadCutover: true,
    presenceSingleSource: true,
    presenceWriteCutover: true,
    presenceCleanup: true,
    presenceGameKeyScoped: true,
    gameCycleResetFix: true,
  };
}
