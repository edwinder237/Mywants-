// Storage boundary. The app only talks to this interface, so a future sync
// layer (e.g. Firestore) can sit behind it without touching the UI.
import type { Want } from "./wants";

export interface LoadResult {
  wants: Want[];
  /** Stored records that failed validation and were left untouched. */
  skipped: number;
}

export interface WantRepository {
  list(): Promise<LoadResult>;
  put(want: Want): Promise<void>;
  remove(id: string): Promise<void>;
  /** Atomically upsert many wants (import → merge). */
  putMany(wants: Want[]): Promise<void>;
  /** Atomically replace everything (import → replace). */
  replaceAll(wants: Want[]): Promise<void>;
}

export class StorageFullError extends Error {
  constructor() {
    super("Your device's storage for this app is full. Remove some photos or delete old wants, then try again.");
    this.name = "StorageFullError";
  }
}

export class StorageError extends Error {
  constructor(message = "Couldn't save to this device. Try again.") {
    super(message);
    this.name = "StorageError";
  }
}

/** Map low-level IndexedDB failures to user-facing errors. */
export function toStorageError(err: unknown): Error {
  if (err instanceof StorageFullError || err instanceof StorageError) return err;
  const name = (err as { name?: string } | null)?.name;
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return new StorageFullError();
  return new StorageError();
}
