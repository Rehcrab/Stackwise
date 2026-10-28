import { loadState, saveState } from './db';
import {
  DEFAULT_SETTINGS,
  defaultState,
  newSession,
  type AppState,
  type Settings,
} from './model';

let state: AppState = defaultState();
const listeners = new Set<(state: AppState) => void>();
let saveTimer: number | undefined;

/** Merge persisted data onto current defaults so older/newer shapes still load. */
function normalize(raw: Partial<AppState> | null): AppState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) };
  settings.volume = Math.min(1, Math.max(0, Number(settings.volume) || 0));
  const blockLibrary = Array.isArray(raw.blockLibrary) ? raw.blockLibrary : [];
  const groupLibrary = Array.isArray(raw.groupLibrary) ? raw.groupLibrary : [];
  const session = raw.session && Array.isArray(raw.session.entries) ? raw.session : newSession();
  return { version: 1, settings, blockLibrary, groupLibrary, session };
}

export async function initState(): Promise<void> {
  state = normalize(await loadState());
}

export function getState(): AppState {
  return state;
}

export function subscribe(listener: (state: AppState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    void saveState(state);
  }, 150);
}

/** Write any pending change right away (page hide, reset, import). */
export function flushSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  void saveState(state);
}

export function update(mutator: (draft: AppState) => void, opts: { touchSession?: boolean } = {}): void {
  const draft = structuredClone(state);
  mutator(draft);
  if (opts.touchSession !== false) draft.session.updatedAt = Date.now();
  state = draft;
  for (const listener of listeners) listener(state);
  scheduleSave();
}

export function replaceState(next: AppState): void {
  state = normalize(next);
  for (const listener of listeners) listener(state);
  flushSave();
}
