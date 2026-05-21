import { SUPABASE_CONFIG } from '../config/supabase.config.js';

let lastRemoteUpdatedAt = null;
let lastSplitSnapshot = null;
let lastSplitFingerprint = '';

const SPLIT_TABLES = {
  players: 'players',
  game: 'game_state',
  confirmations: 'confirmations',
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

function legacyStateUrl(config) {
  const table = encodeURIComponent(config.stateTable);
  const key = encodeURIComponent(config.stateKey);
  return `${baseUrl(config)}/rest/v1/${table}?key=eq.${key}&select=key,state,updated_at&limit=1`;
}

function legacyUpsertUrl(config) {
  return `${baseUrl(config)}/rest/v1/${encodeURIComponent(config.stateTable)}`;
}

function legacyConditionalUpdateUrl(config, expectedUpdatedAt) {
  const key = encodeURIComponent(config.stateKey);
  const updatedAt = encodeURIComponent(expectedUpdatedAt);
  return `${baseUrl(config)}/rest/v1/${encodeURIComponent(config.stateTable)}?key=eq.${key}&updated_at=eq.${updatedAt}`;
}

function getAccessToken() {
  try {
    const raw = localStorage.getItem('harmonia_auth_session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.access_token || null;
  } catch (_error) {
    return null;
  }
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
    game,
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
    game: state.game || null,
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

async function loadLegacyState(config) {
  const result = await requestJson(config, legacyStateUrl(config), { method: 'GET' });

  if (!result.ok) {
    return { ok: false, state: null, updatedAt: null, reason: `legacy_load_failed_${result.status}` };
  }

  const first = Array.isArray(result.data) ? result.data[0] : null;

  if (!first || !first.state || typeof first.state !== 'object') {
    return { ok: false, state: null, updatedAt: first?.updated_at || null, reason: 'legacy_state_empty' };
  }

  lastRemoteUpdatedAt = first.updated_at || null;

  return {
    ok: true,
    state: first.state,
    updatedAt: first.updated_at || null,
    reason: 'legacy_loaded',
    mode: 'legacy',
  };
}

async function loadSplitState(config) {
  const [playersResult, gameResult, confirmationsResult, metaResult] = await Promise.all([
    requestJson(config, tableUrl(config, SPLIT_TABLES.players, 'select=id,auth_user_id,is_admin,data,updated_at&order=data->>name.asc'), { method: 'GET' }),
    requestJson(config, tableUrl(config, SPLIT_TABLES.game, 'key=eq.default&select=key,data,updated_at&limit=1'), { method: 'GET' }),
    requestJson(config, tableUrl(config, SPLIT_TABLES.confirmations, 'select=player_id,data,updated_at'), { method: 'GET' }),
    requestJson(config, tableUrl(config, SPLIT_TABLES.meta, 'key=eq.default&select=key,data,updated_at&limit=1'), { method: 'GET' }),
  ]);

  if (!playersResult.ok || !gameResult.ok || !confirmationsResult.ok || !metaResult.ok) {
    return {
      ok: false,
      state: null,
      updatedAt: null,
      reason: 'split_tables_unavailable',
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
  const confirmations = Array.isArray(confirmationsResult.data)
    ? confirmationsResult.data.map((row) => row.data).filter(Boolean)
    : [];
  const metaRow = Array.isArray(metaResult.data) ? metaResult.data[0] : null;

  const state = composeState({
    players,
    game: gameRow?.data || null,
    confirmations,
    meta: metaRow?.data || {},
  });

  const updatedValues = [
    ...(Array.isArray(playersResult.data) ? playersResult.data.map((row) => row.updated_at) : []),
    ...(Array.isArray(confirmationsResult.data) ? confirmationsResult.data.map((row) => row.updated_at) : []),
    gameRow?.updated_at,
    metaRow?.updated_at,
  ].filter(Boolean).sort();

  lastRemoteUpdatedAt = updatedValues.length ? updatedValues[updatedValues.length - 1] : null;

  if (!isValidSplitState(state)) {
    return {
      ok: false,
      state,
      updatedAt: lastRemoteUpdatedAt,
      reason: 'split_state_empty_or_invalid',
    };
  }

  rememberSplitSnapshot(state, lastRemoteUpdatedAt);

  return {
    ok: true,
    state,
    updatedAt: lastRemoteUpdatedAt,
    reason: 'split_loaded',
    mode: 'split',
  };
}

async function upsertRow(config, table, payload) {
  return await requestJson(config, tableUrl(config, table), {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: JSON.stringify(payload),
  });
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

  for (const [playerId, confirmation] of nextConfirmations.entries()) {
    if (stableStringify(previousConfirmations.get(playerId)) !== stableStringify(confirmation)) {
      operations.push({
        type: 'upsert_confirmation',
        run: () => upsertRow(config, SPLIT_TABLES.confirmations, { player_id: playerId, data: confirmation, updated_at: now }),
      });
    }
  }

  for (const playerId of previousConfirmations.keys()) {
    if (!nextConfirmations.has(playerId)) {
      operations.push({
        type: 'delete_confirmation',
        run: () => deleteRow(config, SPLIT_TABLES.confirmations, 'player_id', playerId),
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

async function upsertLegacyState(config, state) {
  const payload = {
    key: config.stateKey,
    state,
    updated_at: new Date().toISOString(),
  };

  const result = await requestJson(config, legacyUpsertUrl(config), {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    return { ok: false, conflict: false, reason: `legacy_save_failed_${result.status}` };
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  lastRemoteUpdatedAt = rows[0]?.updated_at || payload.updated_at;

  return { ok: true, conflict: false, reason: 'legacy_saved', updatedAt: lastRemoteUpdatedAt };
}

async function updateLegacyStateIfUnchanged(config, state, expectedUpdatedAt) {
  const payload = {
    state,
    updated_at: new Date().toISOString(),
  };

  const result = await requestJson(config, legacyConditionalUpdateUrl(config, expectedUpdatedAt), {
    method: 'PATCH',
    prefer: 'return=representation',
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    return { ok: false, conflict: false, reason: `legacy_save_failed_${result.status}` };
  }

  const rows = Array.isArray(result.data) ? result.data : [];

  if (!rows.length) {
    return { ok: false, conflict: true, reason: 'legacy_conflict_remote_changed' };
  }

  lastRemoteUpdatedAt = rows[0]?.updated_at || payload.updated_at;

  return { ok: true, conflict: false, reason: 'legacy_saved', updatedAt: lastRemoteUpdatedAt };
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
    const split = await loadSplitState(config);

    if (split.ok) {
      return split;
    }

    const legacy = await loadLegacyState(config);

    if (legacy.ok) {
      await saveSplitState(config, legacy.state);
      rememberSplitSnapshot(legacy.state, getLastRemoteUpdatedAt());
      return {
        ...legacy,
        reason: 'legacy_loaded_and_migrated_to_split',
        mode: 'legacy-migrated',
      };
    }

    return split;
  } catch (error) {
    console.warn('[storage.supabase] load failed, falling back to local storage', error);
    return { ok: false, state: null, updatedAt: null, reason: 'supabase_load_exception' };
  }
}

export async function saveRemoteState(state, options = {}) {
  const config = getConfig();

  if (!isSupabaseConfigured()) {
    return { ok: false, conflict: false, reason: 'supabase_not_configured' };
  }

  try {
    const splitResult = await saveSplitState(config, state);

    if (splitResult.ok) {
      return splitResult;
    }

    const expectedUpdatedAt = options.expectedUpdatedAt || lastRemoteUpdatedAt;

    if (expectedUpdatedAt) {
      const legacyResult = await updateLegacyStateIfUnchanged(config, state, expectedUpdatedAt);

      if (legacyResult.ok || legacyResult.conflict) {
        return legacyResult;
      }
    }

    return await upsertLegacyState(config, state);
  } catch (error) {
    console.warn('[storage.supabase] save failed, local storage remains available', error);
    return { ok: false, conflict: false, reason: 'supabase_save_exception' };
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
  };
}
