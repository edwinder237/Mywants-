// IndexedDB implementation of WantRepository, using the small `idb` wrapper.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { isValidWant } from "./backup";
import { toStorageError, type LoadResult, type WantRepository } from "./repository";
import type { Want } from "./wants";

const DB_NAME = "my-wants";
const DB_VERSION = 1;
const STORE = "wants";

interface WantsDB extends DBSchema {
  wants: { key: string; value: Want };
}

/** Errors that mean the cached connection is dead (e.g. WebKit "connection lost"). */
function isConnectionLost(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === "InvalidStateError" || name === "UnknownError";
}

export function createIdbRepository(name = DB_NAME): WantRepository & { close(): Promise<void> } {
  let dbPromise: Promise<IDBPDatabase<WantsDB>> | null = null;

  const db = () => {
    dbPromise ??= openDB<WantsDB>(name, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "id" });
      },
      blocking() {
        // Another tab wants a newer schema: let it proceed.
        void dbPromise?.then((d) => d.close());
        dbPromise = null;
      },
      terminated() {
        // The browser closed the connection (iOS does this after backgrounding).
        dbPromise = null;
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
    return dbPromise;
  };

  /** Run an operation, reopening once if the connection was dropped, and map errors for the UI. */
  async function guard<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (!isConnectionLost(err)) throw toStorageError(err);
      dbPromise = null;
      try {
        return await op();
      } catch (retryErr) {
        throw toStorageError(retryErr);
      }
    }
  }

  return {
    list: () =>
      guard(async (): Promise<LoadResult> => {
        // Records that don't match the current model are skipped, never deleted.
        const records: unknown[] = await (await db()).getAll(STORE);
        const wants = records.filter(isValidWant);
        return { wants, skipped: records.length - wants.length };
      }),
    put: (want) => guard(async () => void (await (await db()).put(STORE, want))),
    remove: (id) => guard(async () => void (await (await db()).delete(STORE, id))),
    putMany: (wants) =>
      guard(async () => {
        const tx = (await db()).transaction(STORE, "readwrite");
        await Promise.all([...wants.map((w) => tx.store.put(w)), tx.done]);
      }),
    replaceAll: (wants) =>
      guard(async () => {
        // Replace what the app can read; unreadable records are never deleted.
        const tx = (await db()).transaction(STORE, "readwrite");
        const readable = ((await tx.store.getAll()) as unknown[]).filter(isValidWant).map((w) => w.id);
        await Promise.all([...readable.map((id) => tx.store.delete(id)), ...wants.map((w) => tx.store.put(w)), tx.done]);
      }),
    close: async () => {
      const pending = dbPromise;
      dbPromise = null;
      if (pending) (await pending).close();
    },
  };
}

/** The app-wide repository. */
export const wantRepository = createIdbRepository();

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Approximate storage used by this site, when the browser reports it. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    return est && typeof est.usage === "number" && typeof est.quota === "number"
      ? { usage: est.usage, quota: est.quota }
      : null;
  } catch {
    return null;
  }
}
