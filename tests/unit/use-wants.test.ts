import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createIdbRepository } from "@/lib/db";
import { StorageFullError, type WantRepository } from "@/lib/repository";
import { useWants } from "@/lib/use-wants";
import { completedCount, createWant, getStatus, type Want, type WantInput } from "@/lib/wants";

let n = 0;
function freshRepo() {
  return createIdbRepository(`hook-test-${++n}`);
}

async function setup(repo: WantRepository = freshRepo()) {
  const hook = renderHook(() => useWants(repo));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return { ...hook, repo };
}

const input: WantInput = { name: "Lamp", priceCents: 4500, dependencies: [{ title: "a" }, { title: "b" }, { title: "c" }] };

describe("useWants", () => {
  it("applies rapid back-to-back toggles without losing any", async () => {
    const { result, repo } = await setup();
    const demo = await act(() => result.current.addDemo());

    // Three taps fired in the same tick, before React re-renders.
    await act(async () => {
      await Promise.all(demo.dependencies.map((d) => result.current.toggle(demo.id, d.id)));
    });

    expect(getStatus(result.current.wants[0])).toBe("unlocked");
    const [stored] = (await repo.list()).wants;
    expect(completedCount(stored)).toBe(3);
  });

  it("refuses to purchase a locked want and leaves storage untouched", async () => {
    const { result, repo } = await setup();
    const demo = await act(() => result.current.addDemo());
    expect(() => result.current.purchase(demo.id)).toThrow(/Complete all three/);
    expect((await repo.list()).wants[0]).not.toHaveProperty("purchasedAt");
  });

  it("archives, restores and purchases through the repository", async () => {
    const { result, repo } = await setup();
    const w = await act(() => result.current.add(input));
    await act(() => result.current.archive(w.id));
    expect(getStatus((await repo.list()).wants[0])).toBe("archived");
    await act(() => result.current.restore(w.id));
    for (const d of w.dependencies) await act(() => result.current.toggle(w.id, d.id));
    const paidAt = new Date(2026, 0, 2, 12);
    await act(() => result.current.purchase(w.id, { purchasedAt: paidAt, finalPriceCents: 4000 }));
    const [stored] = (await repo.list()).wants;
    expect(stored).toMatchObject({ purchasedAt: paidAt.toISOString(), finalPriceCents: 4000 });
    expect(getStatus(result.current.wants[0])).toBe("purchased");
  });

  it("merges imports without touching local-only wants", async () => {
    const { result, repo } = await setup();
    const local = await act(() => result.current.add({ ...input, name: "Local" }));
    const incoming = createWant({ ...input, name: "From file" });
    const plan = await act(() => result.current.merge([incoming]));
    expect(plan).toMatchObject({ added: 1, updated: 0, unchanged: 0 });
    const names = (await repo.list()).wants.map((w) => w.name).sort();
    expect(names).toEqual(["From file", "Local"]);
    expect(result.current.wants.map((w) => w.id)).toContain(local.id);
  });

  it("resyncs from storage and surfaces the error when a write fails", async () => {
    const repo = freshRepo();
    const { result } = await setup(repo);
    const demo = await act(() => result.current.addDemo());

    vi.spyOn(repo, "put").mockRejectedValueOnce(new StorageFullError());
    await act(async () => {
      await expect(result.current.toggle(demo.id, demo.dependencies[0].id)).rejects.toBeInstanceOf(StorageFullError);
    });
    // The optimistic change was rolled back to what is actually stored.
    expect(completedCount(result.current.wants[0] as Want)).toBe(0);
  });

  it("reports unreadable stored records instead of crashing", async () => {
    const repo = freshRepo();
    await repo.put({ id: "legacy", title: "Old shape" } as never);
    const { result } = await setup(repo);
    expect(result.current.skipped).toBe(1);
    expect(result.current.wants).toEqual([]);
  });
});
