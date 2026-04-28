import { SUPABASE_CONFIG } from '../config/supabase.config.js';

let lastRemoteUpdatedAt = null;

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

function buildStateUrl(config) {
  const baseUrl = trimTrailingSlash(config.url);
  const table = encodeURIComponent(config.stateTable);
  const key = encodeURIComponent(config.stateKey);
  return `${baseUrl}/rest/v1/${table}?key=eq.${key}&select=key,state,updated_at&limit=1`;
}

function buildUpsertUrl(config) {
  const baseUrl = trimTrailingSlash(config.url);
  const table = encodeURIComponent(config.stateTable);
  return `${baseUrl}/rest/v1/${table}`;
}

function buildConditionalUpdateUrl(config, expectedUpdatedAt) {
  const baseUrl = trimTrailingSlash(config.url);
  const table = encodeURIComponent(config.stateTable);
  const key = encodeURIComponent(config.stateKey);
  const updatedAt = encodeURIComponent(expectedUpdatedAt);
  return `${baseUrl}/rest/v1/${table}?key=eq.${key}&updated_at=eq.${updatedAt}`;
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
    const response = await fetch(buildStateUrl(config), {
      method: 'GET',
      headers: buildHeaders(config),
    });

    if (!response.ok) {
      return { ok: false, state: null, updatedAt: null, reason: `supabase_load_failed_${response.status}` };
    }

    const rows = await response.json();
    const first = Array.isArray(rows) ? rows[0] : null;

    if (!first || !first.state || typeof first.state !== 'object') {
      return { ok: false, state: null, updatedAt: first?.updated_at || null, reason: 'supabase_state_empty' };
    }

    lastRemoteUpdatedAt = first.updated_at || null;

    return {
      ok: true,
      state: first.state,
      updatedAt: first.updated_at || null,
      reason: 'supabase_loaded',
    };
  } catch (error) {
    console.warn('[storage.supabase] load failed, falling back to local storage', error);
    return { ok: false, state: null, updatedAt: null, reason: 'supabase_load_exception' };
  }
}

async function upsertRemoteState(config, state) {
  const payload = {
    key: config.stateKey,
    state,
    updated_at: new Date().toISOString(),
  };

  const response = await fetch(buildUpsertUrl(config), {
    method: 'POST',
    headers: buildHeaders(config, 'resolution=merge-duplicates,return=representation'),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { ok: false, reason: `supabase_save_failed_${response.status}` };
  }

  const rows = await response.json().catch(() => []);
  const first = Array.isArray(rows) ? rows[0] : null;
  lastRemoteUpdatedAt = first?.updated_at || payload.updated_at;

  return { ok: true, reason: 'supabase_saved', updatedAt: lastRemoteUpdatedAt };
}

async function updateRemoteStateIfUnchanged(config, state, expectedUpdatedAt) {
  const payload = {
    state,
    updated_at: new Date().toISOString(),
  };

  const response = await fetch(buildConditionalUpdateUrl(config, expectedUpdatedAt), {
    method: 'PATCH',
    headers: buildHeaders(config, 'return=representation'),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { ok: false, conflict: false, reason: `supabase_save_failed_${response.status}` };
  }

  const rows = await response.json().catch(() => []);

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, conflict: true, reason: 'supabase_conflict_remote_changed' };
  }

  lastRemoteUpdatedAt = rows[0]?.updated_at || payload.updated_at;

  return { ok: true, conflict: false, reason: 'supabase_saved', updatedAt: lastRemoteUpdatedAt };
}

export async function saveRemoteState(state, options = {}) {
  const config = getConfig();

  if (!isSupabaseConfigured()) {
    return { ok: false, conflict: false, reason: 'supabase_not_configured' };
  }

  try {
    const expectedUpdatedAt = options.expectedUpdatedAt || lastRemoteUpdatedAt;

    if (expectedUpdatedAt) {
      const result = await updateRemoteStateIfUnchanged(config, state, expectedUpdatedAt);

      if (result.conflict) {
        return result;
      }

      if (result.ok) {
        return result;
      }

      return result;
    }

    return await upsertRemoteState(config, state);
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
  };
}
