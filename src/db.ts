import { openDB, type IDBPDatabase } from 'idb';
import type { AppState } from './model';

const DB_NAME = 'stackwise';
const STORE = 'kv';
const KEY = 'state';
const LS_KEY = 'stackwise:state';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

export async function loadState(): Promise<AppState | null> {
  try {
    const database = await db();
    const stored = (await database.get(STORE, KEY)) as AppState | undefined;
    if (stored) return stored;
  } catch (err) {
    console.warn('IndexedDB unavailable, falling back to localStorage', err);
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* ignore */
  }
  return null;
}

export async function saveState(state: AppState): Promise<void> {
  try {
    const database = await db();
    await database.put(STORE, state, KEY);
    return;
  } catch (err) {
    console.warn('IndexedDB write failed, falling back to localStorage', err);
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* storage may be full or blocked */
  }
}
