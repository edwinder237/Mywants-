"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { planMerge, type MergePlan } from "./backup";
import { requestPersistentStorage, wantRepository } from "./db";
import type { WantRepository } from "./repository";
import {
  archiveWant,
  createDemoWant,
  createWant,
  markPurchased,
  restoreWant,
  toggleDependency,
  updateWant,
  type PurchaseInput,
  type Want,
  type WantInput,
} from "./wants";

const CHANNEL_NAME = "my-wants";

/**
 * Owns the in-memory list of wants and writes every change through the
 * repository. Rules live in ./wants; this hook only sequences them.
 */
export function useWants(repo: WantRepository = wantRepository) {
  const [wants, setWants] = useState<Want[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  // Latest list, readable synchronously so rapid taps never act on stale state.
  const latest = useRef<Want[]>([]);

  const apply = useCallback((next: Want[]) => {
    latest.current = next;
    setWants(next);
  }, []);

  // Keep other open tabs in step, so a stale tab can't overwrite newer changes.
  const channel = useRef<BroadcastChannel | null>(null);
  const announce = useCallback(() => channel.current?.postMessage("changed"), []);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(CHANNEL_NAME);
    channel.current = bc;
    bc.onmessage = () => {
      repo
        .list()
        .then((result) => {
          apply(result.wants);
          setSkipped(result.skipped);
        })
        .catch(() => {});
    };
    return () => {
      bc.close();
      channel.current = null;
    };
  }, [apply, repo]);

  useEffect(() => {
    let cancelled = false;
    repo
      .list()
      .then((result) => {
        if (cancelled) return;
        apply(result.wants);
        setSkipped(result.skipped);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Couldn't open on-device storage. Private Browsing can block it. Try a normal window.");
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apply, repo]);

  /**
   * Optimistically apply a change, then persist it. If the write fails, resync
   * from storage (which also keeps other in-flight writes); if storage can't
   * be read either, undo this change. Rethrows so the UI can explain.
   */
  const persist = useCallback(
    async (next: Want[], write: () => Promise<void>) => {
      const prev = latest.current;
      apply(next);
      try {
        await write();
      } catch (err) {
        try {
          apply((await repo.list()).wants);
        } catch {
          if (latest.current === next) apply(prev);
        }
        throw err;
      }
      announce();
    },
    [announce, apply, repo],
  );

  // Ask the browser to protect our storage once there is something worth
  // keeping, rather than prompting (Firefox) on first visit.
  const askedPersist = useRef(false);
  const protectStorage = useCallback(() => {
    if (askedPersist.current) return;
    askedPersist.current = true;
    void requestPersistentStorage();
  }, []);

  const commit = useCallback(
    async (next: Want) => {
      const prev = latest.current;
      const exists = prev.some((w) => w.id === next.id);
      await persist(exists ? prev.map((w) => (w.id === next.id ? next : w)) : [...prev, next], () => repo.put(next));
      protectStorage();
      return next;
    },
    [persist, protectStorage, repo],
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
    /** Stored records that failed validation on load (left in storage, not shown). */
    skipped,
    add: (input: WantInput) => commit(createWant(input)),
    addDemo: () => commit(createDemoWant()),
    edit: (id: string, input: WantInput, purchase?: PurchaseInput) =>
      commit(updateWant(find(id), input, new Date(), purchase)),
    toggle: (id: string, depId: string) => commit(toggleDependency(find(id), depId)),
    purchase: (id: string, input?: PurchaseInput) => commit(markPurchased(find(id), input)),
    archive: (id: string) => commit(archiveWant(find(id))),
    restore: (id: string) => commit(restoreWant(find(id))),
    remove: (id: string) => persist(latest.current.filter((w) => w.id !== id), () => repo.remove(id)),
    /** Preview of a merge against the current list. */
    planMerge: (incoming: Want[]): MergePlan => planMerge(latest.current, incoming),
    merge: async (incoming: Want[]) => {
      const plan = planMerge(latest.current, incoming);
      await persist(plan.wants, () => repo.putMany(plan.changed));
      if (plan.changed.length > 0) protectStorage();
      return plan;
    },
    replaceAll: async (next: Want[]) => {
      await persist(next, () => repo.replaceAll(next));
      if (next.length > 0) protectStorage();
    },
  };
}

export type WantsApi = ReturnType<typeof useWants>;
