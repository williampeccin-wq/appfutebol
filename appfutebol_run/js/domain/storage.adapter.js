import { loadLocalState, saveLocalState, resetLocalState } from "../services/storage.local.js";
import { loadRemoteState, saveRemoteState, getSupabaseMeta, isSupabaseConfigured } from "../services/storage.supabase.js";

const BACKEND_LOCAL = "local-storage";
const BACKEND_SUPABASE = "supabase-with-local-fallback";

function validateLocalSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    console.warn("[storage.adapter] invalid snapshot, resetting");
    return resetLocalState();
  }

  return snapshot;
}

function createHybridStorageAdapter() {
  return {
    kind: isSupabaseConfigured() ? BACKEND_SUPABASE : BACKEND_LOCAL,

    async getState() {
      const localSnapshot = validateLocalSnapshot(loadLocalState());

      if (!isSupabaseConfigured()) {
        return localSnapshot;
      }

      const remote = await loadRemoteState();

      if (remote.ok && remote.state && typeof remote.state === "object") {
        saveLocalState(remote.state);
        return validateLocalSnapshot(remote.state);
      }

      await saveRemoteState(localSnapshot);
      return localSnapshot;
    },

    saveState(state) {
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
