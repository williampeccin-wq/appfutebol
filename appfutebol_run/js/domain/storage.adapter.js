import { loadLocalState, saveLocalState, resetLocalState } from "../services/storage.local.js";
import { validateAndRepairState } from "./state.guard.js";
import { loadRemoteState, saveRemoteState, getSupabaseMeta, isSupabaseConfigured, getLastRemoteUpdatedAt } from "../services/storage.supabase.js";

const BACKEND_LOCAL = "local-storage";
const BACKEND_SUPABASE = "supabase-with-local-fallback";

const DEFAULT_UI = {
  currentTab: "home",
  authMode: "login",
  authMessage: null,
};

let remoteSaveQueue = Promise.resolve();

function cloneSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function isValidAppState(snapshot) {
  return !!(
    snapshot &&
    typeof snapshot === "object" &&
    Array.isArray(snapshot.players) &&
    snapshot.game &&
    typeof snapshot.game === "object" &&
    Array.isArray(snapshot.confirmations)
  );
}

function getStoredAuthSession() {
  try {
    const raw = localStorage.getItem("harmonia_auth_session");
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    localStorage.removeItem("harmonia_auth_session");
    return null;
  }
}

function hasStoredAccessToken() {
  return !!getStoredAuthSession()?.access_token;
}

function isStoredSessionExpired(skewSeconds = 15) {
  const session = getStoredAuthSession();
  const expiresAt = Number(session?.expires_at || 0);
  if (!session?.access_token || !expiresAt) return false;
  return Math.floor(Date.now() / 1000) >= (expiresAt - skewSeconds);
}

function clearStoredAuthSession() {
  localStorage.removeItem("harmonia_auth_session");
}

function notifySessionExpired(reason = "expired_session") {
  clearStoredAuthSession();
  window.dispatchEvent(new CustomEvent("harmonia:session-expired", {
    detail: { reason },
  }));
}

function hasOperationalSession(state) {
  return !!(state?.session?.playerId || state?.session?.authUserId || getStoredAuthSession()?.user?.id);
}

function getSafeLocalSnapshot() {
  const snapshot = loadLocalState();

  if (isValidAppState(snapshot)) {
    return snapshot;
  }

  console.warn("[storage.adapter] invalid local snapshot, resetting to seed");
  return resetLocalState();
}

function getStoredAuthUserId() {
  return getStoredAuthSession()?.user?.id || null;
}

function resolveSessionFromAuth(remoteSnapshot, localSnapshot) {
  const authUserId = getStoredAuthUserId() || localSnapshot?.session?.authUserId || null;
  const player = authUserId && Array.isArray(remoteSnapshot?.players)
    ? remoteSnapshot.players.find((item) => String(item?.auth_user_id || "") === String(authUserId))
    : null;

  return {
    playerId: player?.id || null,
    authUserId,
  };
}

function preserveBrowserLocalFields(remoteSnapshot, localSnapshot) {
  return {
    ...remoteSnapshot,
    session: resolveSessionFromAuth(remoteSnapshot, localSnapshot),
    ui: {
      ...DEFAULT_UI,
      ...(localSnapshot?.ui || {}),
    },
  };
}

function createRemoteSnapshot(state) {
  return {
    ...state,
    session: { playerId: null },
    ui: { ...DEFAULT_UI },
  };
}

function createHybridStorageAdapter() {
  return {
    kind: isSupabaseConfigured() ? BACKEND_SUPABASE : BACKEND_LOCAL,

    async getState() {
      const localSnapshot = getSafeLocalSnapshot();

      if (!isSupabaseConfigured() || !hasStoredAccessToken()) {
        return localSnapshot;
      }

      if (isStoredSessionExpired()) {
        notifySessionExpired("expired_before_load");
        return {
          ...localSnapshot,
          session: { playerId: null, authUserId: null },
          ui: { ...DEFAULT_UI, authMessage: null },
        };
      }

      const remote = await loadRemoteState();

      if (remote.ok && isValidAppState(remote.state)) {
        const merged = preserveBrowserLocalFields(remote.state, localSnapshot);
        saveLocalState(merged);
        return merged;
      }

      if (remote.ok && !isValidAppState(remote.state)) {
        console.warn("[storage.adapter] ignoring invalid remote state and keeping local snapshot");
      }

      await saveRemoteState(createRemoteSnapshot(localSnapshot));
      return localSnapshot;
    },

    saveState(state) {
      const repaired = validateAndRepairState(state);
      const safeState = repaired.state;

      if (repaired.warnings.length) {
        console.warn("[storage.adapter] Reparos aplicados antes de persistir:", repaired.warnings);
      }

      if (!isValidAppState(safeState)) {
        console.warn("[storage.adapter] blocked invalid state write", safeState);
        return Promise.resolve({ ok: false, reason: 'invalid_state' });
      }

      if (isSupabaseConfigured() && hasOperationalSession(safeState)) {
        if (!hasStoredAccessToken() || isStoredSessionExpired()) {
          notifySessionExpired("expired_before_save");
          return Promise.resolve({ ok: false, reason: "expired_session" });
        }
      }

      saveLocalState(safeState);

      if (isSupabaseConfigured() && hasStoredAccessToken()) {
        const snapshotToPersist = cloneSnapshot(safeState);

        remoteSaveQueue = remoteSaveQueue.then(async () => {
          const expectedUpdatedAt = getLastRemoteUpdatedAt();

          const result = await saveRemoteState(
            createRemoteSnapshot(snapshotToPersist),
            { expectedUpdatedAt }
          );

          if (result.conflict) {
            console.warn("[storage.adapter] remote conflict detected; local change was not pushed:", result.reason);
            window.dispatchEvent(new CustomEvent("harmonia:remote-conflict", {
              detail: { reason: result.reason },
            }));
            return;
          }

          if (!result.ok) {
            console.warn("[storage.adapter] remote save skipped/failed:", result.reason);
            if (result.status === 401 || result.status === 403 || /401|403|jwt|token|session/i.test(String(result.reason || ""))) {
              notifySessionExpired(result.reason || "remote_save_auth_failed");
            }
          }
        }).catch((error) => {
          console.warn("[storage.adapter] remote save queue failed:", error);
          return { ok: false, reason: 'remote_save_queue_failed', error };
        });

        return remoteSaveQueue;
      }

      return Promise.resolve({ ok: true, reason: 'local_saved' });
    },

    async resetState() {
      const seed = resetLocalState();

      if (isSupabaseConfigured()) {
        await saveRemoteState(createRemoteSnapshot(seed));
      }

      return seed;
    },
  };
}

const activeStorageAdapter = createHybridStorageAdapter();

export function getStorageAdapter() {
  return activeStorageAdapter;
}

export function getStorageMeta() {
  return {
    backend: activeStorageAdapter.kind,
    supabase: getSupabaseMeta(),
  };
}

export async function getState() {
  try {
    return await activeStorageAdapter.getState();
  } catch (e) {
    console.warn("[storage.adapter] failed to load, resetting", e);
    return resetLocalState();
  }
}

export function saveState(state) {
  return activeStorageAdapter.saveState(state);
}

export async function resetState() {
  return await activeStorageAdapter.resetState();
}
