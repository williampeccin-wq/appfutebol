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

function getSafeLocalSnapshot() {
  const snapshot = loadLocalState();

  if (isValidAppState(snapshot)) {
    return snapshot;
  }

  console.warn("[storage.adapter] invalid local snapshot, resetting to seed");
  return resetLocalState();
}

function preserveBrowserLocalFields(remoteSnapshot, localSnapshot) {
  return {
    ...remoteSnapshot,
    session: {
      ...(localSnapshot?.session || { playerId: null }),
    },
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

      if (!isSupabaseConfigured()) {
        return localSnapshot;
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
        return;
      }

      saveLocalState(safeState);

      if (isSupabaseConfigured()) {
        const expectedUpdatedAt = getLastRemoteUpdatedAt();

        saveRemoteState(createRemoteSnapshot(safeState), { expectedUpdatedAt }).then((result) => {
          if (result.conflict) {
            console.warn("[storage.adapter] remote conflict detected; local change was not pushed:", result.reason);
            window.dispatchEvent(new CustomEvent("harmonia:remote-conflict", {
              detail: { reason: result.reason },
            }));
            return;
          }

          if (!result.ok) {
            console.warn("[storage.adapter] remote save skipped/failed:", result.reason);
          }
        });
      }
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
  activeStorageAdapter.saveState(state);
}

export async function resetState() {
  return await activeStorageAdapter.resetState();
}
