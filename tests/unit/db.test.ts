import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIdbRepository } from "@/lib/db";
import { StorageFullError, toStorageError } from "@/lib/repository";
import { archiveWant, createDemoWant, createWant, toggleDependency, type WantInput } from "@/lib/wants";

let n = 0;
let repo: ReturnType<typeof createIdbRepository>;
let dbName: string;

beforeEach(() => {
  dbName = `test-${++n}`;
  repo = createIdbRepository(dbName);
});
afterEach(() => repo.close());

/** Simulates a browser restart: drop the connection and open a fresh one. */
async function restart() {
  await repo.close();
  repo = createIdbRepository(dbName);
}

const input: WantInput = { name: "Lamp", priceCents: 4500, dependencies: [{ title: "a" }, { title: "b" }, { title: "c" }] };

describe("IndexedDB repository", () => {
  it("persists wants across restarts", async () => {
    const w = createDemoWant();
    await repo.put(w);
    await restart();
    expect(await repo.list()).toEqual({ wants: [w], skipped: 0 });
  });

  it("persists updates and removals", async () => {
    const w = createDemoWant();
    await repo.put(w);
    await repo.put(archiveWant(toggleDependency(w, w.dependencies[0].id)));
    await restart();
    const [stored] = (await repo.list()).wants;
    expect(stored.dependencies[0].completed).toBe(true);
    expect(stored.archivedAt).toBeDefined();
    await repo.remove(w.id);
    await restart();
    expect((await repo.list()).wants).toEqual([]);
  });

  it("putMany upserts and replaceAll swaps the whole dataset", async () => {
    const a = createWant({ ...input, name: "A" });
    await repo.put(a);
    const b = createWant({ ...input, name: "B" });
    await repo.putMany([{ ...a, name: "A2" }, b]);
    expect((await repo.list()).wants.map((w) => w.name).sort()).toEqual(["A2", "B"]);
    const c = createWant({ ...input, name: "C" });
    await repo.replaceAll([c]);
    await restart();
    expect((await repo.list()).wants).toEqual([c]);
  });

  it("skips invalid stored records without deleting them", async () => {
    const good = createDemoWant();
    await repo.put(good);
    await repo.put({ id: "legacy", title: "Old shape" } as never);
    await restart();
    expect(await repo.list()).toEqual({ wants: [good], skipped: 1 });
  });
});

describe("replace import", () => {
  it("replaces readable wants but never deletes unreadable records", async () => {
    await repo.put(createDemoWant());
    await repo.put({ id: "legacy", title: "Old shape" } as never);
    const fresh = createWant({ ...input, name: "Fresh" });
    await repo.replaceAll([fresh]);
    await restart();
    expect(await repo.list()).toEqual({ wants: [fresh], skipped: 1 });
  });
});

describe("storage errors", () => {
  it("maps quota errors to a friendly StorageFullError", () => {
    const quota = new DOMException("full", "QuotaExceededError");
    expect(toStorageError(quota)).toBeInstanceOf(StorageFullError);
    expect(toStorageError(quota).message).toMatch(/storage .* is full/i);
    expect(toStorageError(new Error("boom")).message).toMatch(/Couldn't save/);
  });
});
