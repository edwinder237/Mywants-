import { beforeEach, describe, expect, it } from "vitest";
import { closeDb, loadWants, removeWant, replaceAllWants, saveWant } from "@/lib/db";
import { createSampleWant, toggleDependency } from "@/lib/wants";

// Simulates an app restart by closing and reopening the IndexedDB connection.
async function restart() {
  await closeDb();
}

beforeEach(async () => {
  await replaceAllWants([]);
  await restart();
});

describe("IndexedDB persistence", () => {
  it("persists saved wants across restarts", async () => {
    const w = createSampleWant();
    await saveWant(w);
    await restart();
    expect(await loadWants()).toEqual([w]);
  });

  it("persists updates and deletions", async () => {
    const w = createSampleWant();
    await saveWant(w);
    const toggled = toggleDependency(w, w.dependencies[0].id);
    await saveWant(toggled);
    await restart();
    expect((await loadWants())[0].dependencies[0].completedAt).not.toBeNull();
    await removeWant(w.id);
    await restart();
    expect(await loadWants()).toEqual([]);
  });

  it("replaceAll swaps the whole dataset", async () => {
    await saveWant(createSampleWant());
    const next = [createSampleWant(), createSampleWant()];
    await replaceAllWants(next);
    await restart();
    const stored = await loadWants();
    expect(stored.map((w) => w.id).sort()).toEqual(next.map((w) => w.id).sort());
  });
});
