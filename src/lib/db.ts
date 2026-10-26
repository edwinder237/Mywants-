// IndexedDB persistence. One object store keyed by want id.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Want } from "./wants";

const DB_NAME = "my-wants";
const DB_VERSION = 1;
const STORE = "wants";

interface WantsDB extends DBSchema {
  wants: { key: string; value: Want };
}

let dbPromise: Promise<IDBPDatabase<WantsDB>> | null = null;

function getDb() {
  dbPromise ??= openDB<WantsDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    },
  });
  return dbPromise;
}

export async function loadWants(): Promise<Want[]> {
  return (await getDb()).getAll(STORE);
}

export async function saveWant(want: Want): Promise<void> {
  await (await getDb()).put(STORE, want);
}

export async function removeWant(id: string): Promise<void> {
  await (await getDb()).delete(STORE, id);
}

/** Atomically replace every stored want (used by import). */
export async function replaceAllWants(wants: Want[]): Promise<void> {
  const tx = (await getDb()).transaction(STORE, "readwrite");
  await tx.store.clear();
  await Promise.all(wants.map((w) => tx.store.put(w)));
  await tx.done;
}

/** Close the connection. Used by tests to simulate a fresh app start. */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  (await dbPromise).close();
  dbPromise = null;
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
