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
// Quantas escritas locais ainda não foram confirmadas no servidor. Enquanto > 0,
// o poll de sync NÃO deve aplicar o estado remoto (ele seria mais antigo que a
// edição local pendente e reverteria a alteração do usuário — lost update).
let pendingRemoteWrites = 0;

export function hasPendingRemoteWrites() {
  return pendingRemoteWrites > 0;
}

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

function hasStoredAccessToken() {
  try {
    const raw = localStorage.getItem("harmonia_auth_session");
    if (!raw) return false;
    const session = JSON.parse(raw);
    return !!session?.access_token;
  } catch (_error) {
    return false;
  }
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
  try {
    const raw = localStorage.getItem("harmonia_auth_session");
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.user?.id || null;
  } catch (_error) {
    return null;
  }
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

      saveLocalState(safeState);

      if (isSupabaseConfigured() && hasStoredAccessToken()) {
        const snapshotToPersist = cloneSnapshot(safeState);
        // Captura o "updated_at esperado" AGORA (no enqueue), não na hora de
        // rodar — assim reflete o estado que o usuário viu ao editar.
        const expectedUpdatedAt = getLastRemoteUpdatedAt();

        pendingRemoteWrites += 1;
        remoteSaveQueue = remoteSaveQueue.then(async () => {
          const result = await saveRemoteState(
            createRemoteSnapshot(snapshotToPersist),
            { expectedUpdatedAt }
          );

          // Chegar aqui significa que nem o rebase resolveu: a alteração NÃO
          // está no servidor. O estado local será substituído pelo remoto, ou
          // seja, o que o usuário acabou de fazer vai sumir da tela. Isso
          // precisa ser dito — foi o silêncio aqui que fez um resultado de
          // campeonato desaparecer sem ninguém perceber (INCIDENTE 23/07).
          if (result.conflict) {
            console.warn("[storage.adapter] remote conflict detected; local change was not pushed:", result.reason);
            window.dispatchEvent(new CustomEvent("harmonia:remote-conflict", {
              detail: { reason: result.reason },
            }));
            window.dispatchEvent(new CustomEvent("harmonia:remote-save-failed", {
              detail: { reason: result.reason, conflict: true },
            }));
            return;
          }

          if (!result.ok) {
            console.warn("[storage.adapter] remote save skipped/failed:", result.reason);
            window.dispatchEvent(new CustomEvent("harmonia:remote-save-failed", {
              detail: { reason: result.reason, conflict: false },
            }));
          }
        }).catch((error) => {
          console.warn("[storage.adapter] remote save queue failed:", error);
          window.dispatchEvent(new CustomEvent("harmonia:remote-save-failed", {
            detail: { reason: 'remote_save_queue_failed', conflict: false },
          }));
          return { ok: false, reason: 'remote_save_queue_failed', error };
        }).finally(() => {
          pendingRemoteWrites = Math.max(0, pendingRemoteWrites - 1);
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
