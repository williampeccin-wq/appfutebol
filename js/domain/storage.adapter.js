import { loadLocalState, saveLocalState, resetLocalState } from "../services/storage.local.js";

const BACKEND_LOCAL = "local-storage";

function createLocalStorageAdapter() {
  return {
    kind: BACKEND_LOCAL,
    getState() {
      return loadLocalState();
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
