import { loadLocalState, saveLocalState, resetLocalState } from "../services/storage.local.js";
import { loadRemoteState, saveRemoteState, getSupabaseMeta, isSupabaseConfigured } from "../services/storage.supabase.js";

const BACKEND_LOCAL = "local-storage";
const BACKEND_SUPABASE = "supabase-with-local-fallback";

function isValidAppState(snapshot) {
  return !!(
    snapshot &&
    typeof snapshot === "object" &&
    Array.isArray(snapshot.players) &&
    snapshot.players.length > 0 &&
    snapshot.game &&
    typeof snapshot.game === "object" &&
    Array.isArray(snapshot.confirmations)
  );
}

function getSafeLocalSnapshot() {
  const snapshot = loadLocalState();

  if (isValidAppState(snapshot)) {
    return snapshot;
  }

  console.warn("[storage.adapter] invalid local snapshot, resetting to seed");
  return resetLocalState();
}

function createHybridStorageAdapter() {
  return {
    kind: isSupabaseConfigured() ? BACKEND_SUPABASE : BACKEND_LOCAL,

    async getState() {
      const localSnapshot = getSafeLocalSnapshot();

      if (!isSupabaseConfigured()) {
        return localSnapshot;
      }

      const remote = await loadRemoteState();

      if (remote.ok && isValidAppState(remote.state)) {
        saveLocalState(remote.state);
        return remote.state;
      }

      if (remote.ok && !isValidAppState(remote.state)) {
        console.warn("[storage.adapter] ignoring invalid remote state and keeping local snapshot");
      }

      await saveRemoteState(localSnapshot);
      return localSnapshot;
    },

    saveState(state) {
      if (!isValidAppState(state)) {
        console.warn("[storage.adapter] blocked invalid state write", state);
        return;
      }

      saveLocalState(state);

      if (isSupabaseConfigured()) {
        saveRemoteState(state).then((result) => {
          if (!result.ok) {
            console.warn("[storage.adapter] remote save skipped/failed:", result.reason);
          }
        });
      }
    },

    async resetState() {
      const seed = resetLocalState();

      if (isSupabaseConfigured()) {
        await saveRemoteState(seed);
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
  activeStorageAdapter.saveState(state);
}

export async function resetState() {
  return await activeStorageAdapter.resetState();
}
