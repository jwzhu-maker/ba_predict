import {
  STORAGE_KEY,
  createInitialState,
  deserializeState,
  serializeState,
  type AppState,
} from "@ba-predict/app-core";

/**
 * Browser-side storage.
 *
 * Every access is wrapped: `localStorage` throws outright in some private
 * browsing modes, and nothing here is important enough to break the app over.
 * Nothing leaves the device — the app has no backend, which is the right shape
 * for a tool holding a record of somebody's gambling.
 */
export function loadState(): AppState {
  try {
    return deserializeState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return createInitialState();
  }
}

export function saveState(state: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeState(state));
  } catch {
    // Storage full or blocked: the app keeps working, it just forgets.
  }
}
