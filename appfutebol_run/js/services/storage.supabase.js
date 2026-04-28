import { SUPABASE_CONFIG } from '../config/supabase.config.js';

let lastRemoteUpdatedAt = null;

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

function buildHeaders(config, prefer = null) {
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    'Content-Type': 'application/json',
  };

  if (prefer) headers.Prefer = prefer;

  return headers;
}

function isValidSplitState(state) {
  return !!(
    state &&
    typeof state === 'object' &&
    Array.isArray(state.players) &&
    state.players.length > 0 &&
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
    requestJson(config, tableUrl(config, SPLIT_TABLES.players, 'select=id,data,updated_at&order=data->>name.asc'), { method: 'GET' }),
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
    ? playersResult.data.map((row) => row.data).filter(Boolean)
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

  return {
    ok: true,
    state,
    updatedAt: lastRemoteUpdatedAt,
    reason: 'split_loaded',
    mode: 'split',
  };
}

async function deleteRowsNotIn(config, table, idColumn, ids) {
  const encodedTable = encodeURIComponent(table);

  if (!ids.length) {
    const result = await fetch(`${baseUrl(config)}/rest/v1/${encodedTable}?${idColumn}=not.is.null`, {
      method: 'DELETE',
      headers: buildHeaders(config),
    });
    return result.ok;
  }

  const list = ids.map((id) => `"${String(id).replaceAll('"', '\\"')}"`).join(',');
  const result = await fetch(`${baseUrl(config)}/rest/v1/${encodedTable}?${idColumn}=not.in.(${list})`, {
    method: 'DELETE',
    headers: buildHeaders(config),
  });
  return result.ok;
}

async function saveSplitState(config, state) {
  const parts = splitState(state);

  if (!parts.players.length || !parts.game) {
    return { ok: false, conflict: false, reason: 'split_save_invalid_state' };
  }

  const now = new Date().toISOString();

  const playerRows = parts.players.map((player) => ({
    id: player.id,
    data: player,
    updated_at: now,
  }));

  const confirmationRows = parts.confirmations.map((confirmation) => ({
    player_id: confirmation.player_id,
    data: confirmation,
    updated_at: now,
  }));

  const gameRow = {
    key: 'default',
    data: parts.game,
    updated_at: now,
  };

  const metaRow = {
    key: 'default',
    data: parts.meta,
    updated_at: now,
  };

  const [playersResult, confirmationsResult, gameResult, metaResult] = await Promise.all([
    requestJson(config, tableUrl(config, SPLIT_TABLES.players), {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: JSON.stringify(playerRows),
    }),
    confirmationRows.length
      ? requestJson(config, tableUrl(config, SPLIT_TABLES.confirmations), {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: JSON.stringify(confirmationRows),
        })
      : Promise.resolve({ ok: true, data: [] }),
    requestJson(config, tableUrl(config, SPLIT_TABLES.game), {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: JSON.stringify(gameRow),
    }),
    requestJson(config, tableUrl(config, SPLIT_TABLES.meta), {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: JSON.stringify(metaRow),
    }),
  ]);

  if (!playersResult.ok || !confirmationsResult.ok || !gameResult.ok || !metaResult.ok) {
    return { ok: false, conflict: false, reason: 'split_save_failed' };
  }

  await Promise.all([
    deleteRowsNotIn(config, SPLIT_TABLES.players, 'id', parts.players.map((player) => player.id)),
    deleteRowsNotIn(config, SPLIT_TABLES.confirmations, 'player_id', parts.confirmations.map((entry) => entry.player_id)),
  ]);

  lastRemoteUpdatedAt = now;

  return { ok: true, conflict: false, reason: 'split_saved', updatedAt: now };
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
  };
}
