import { loadLocalState, saveLocalState, resetLocalState } from "../services/storage.local.js";

const BACKEND_LOCAL = "local-storage";

function createLocalStorageAdapter() {
  return {
    kind: BACKEND_LOCAL,
    getState() {
      try {
        const snapshot = loadLocalState();

        if (!snapshot || typeof snapshot !== "object") {
          console.warn("[storage.adapter] invalid snapshot, resetting");
          return resetLocalState();
        }

        return snapshot;
      } catch (e) {
        console.warn("[storage.adapter] failed to load, resetting", e);
        return resetLocalState();
      }
    },
    saveState(state) {
      saveLocalState(state);
    },
    resetState() {
      return resetLocalState();
    },
  };
}

const activeStorageAdapter = createLocalStorageAdapter();

export function getStorageAdapter() {
  return activeStorageAdapter;
}

export function getStorageMeta() {
  return {
    backend: activeStorageAdapter.kind,
  };
}

export function getState() {
  return activeStorageAdapter.getState();
}

export function saveState(state) {
  activeStorageAdapter.saveState(state);
}

export function resetState() {
  return activeStorageAdapter.resetState();
}
