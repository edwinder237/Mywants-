"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as db from "./db";
import {
  createSampleWant,
  createWant,
  markPurchased,
  toggleDependency,
  updateWant,
  type Want,
  type WantInput,
} from "./wants";

/**
 * Owns the in-memory list of wants and writes every change through to
 * IndexedDB. Transitions come from ./wants so the rules live in one place.
 */
export function useWants() {
  const [wants, setWants] = useState<Want[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Latest list, readable synchronously so rapid taps never act on stale state.
  const latest = useRef<Want[]>([]);

  const apply = useCallback((next: Want[]) => {
    latest.current = next;
    setWants(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    db.loadWants()
      .then((stored) => {
        if (!cancelled) apply(stored);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(
            "Couldn't open on-device storage. Private Browsing can block it. Try a normal tab.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    void db.requestPersistentStorage();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  /** Optimistically apply a change, then persist it; roll back if the write fails. */
  const persist = useCallback(
    async (next: Want[], write: () => Promise<void>) => {
      const previous = latest.current;
      apply(next);
      try {
        await write();
      } catch {
        apply(previous);
        throw new Error("Couldn't save to this device. Try again.");
      }
    },
    [apply],
  );

  const commit = useCallback(
    async (next: Want) => {
      const prev = latest.current;
      const exists = prev.some((w) => w.id === next.id);
      await persist(exists ? prev.map((w) => (w.id === next.id ? next : w)) : [...prev, next], () =>
        db.saveWant(next),
      );
      return next;
    },
    [persist],
  );

  const find = (id: string) => {
    const want = latest.current.find((w) => w.id === id);
    if (!want) throw new Error("That want no longer exists.");
    return want;
  };

  return {
    wants,
    ready,
    loadError,
    add: (input: WantInput) => commit(createWant(input)),
    addSample: () => commit(createSampleWant()),
    edit: (id: string, input: WantInput) => commit(updateWant(find(id), input)),
    toggle: (id: string, depId: string) => commit(toggleDependency(find(id), depId)),
    purchase: (id: string) => commit(markPurchased(find(id))),
    remove: (id: string) => persist(latest.current.filter((w) => w.id !== id), () => db.removeWant(id)),
    replaceAll: (next: Want[]) => persist(next, () => db.replaceAllWants(next)),
  };
}

export type WantsApi = ReturnType<typeof useWants>;
