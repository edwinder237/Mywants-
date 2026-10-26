import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDb, loadWants, replaceAllWants } from "@/lib/db";
import { useWants } from "@/lib/use-wants";
import { completedCount, getStatus } from "@/lib/wants";

beforeEach(async () => {
  await replaceAllWants([]);
  await closeDb();
});

describe("useWants", () => {
  it("applies rapid back-to-back toggles without losing any", async () => {
    const { result } = renderHook(() => useWants());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const sample = await act(() => result.current.addSample());

    // Three taps fired in the same tick, before React re-renders.
    await act(async () => {
      await Promise.all(sample.dependencies.map((d) => result.current.toggle(sample.id, d.id)));
    });

    expect(getStatus(result.current.wants[0])).toBe("unlocked");
    const [stored] = await loadWants();
    expect(completedCount(stored)).toBe(3);
  });

  it("refuses to purchase a locked want and leaves storage untouched", async () => {
    const { result } = renderHook(() => useWants());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const sample = await act(() => result.current.addSample());
    expect(() => result.current.purchase(sample.id)).toThrow(/Complete all three/);
    const [stored] = await loadWants();
    expect(stored.purchasedAt).toBeNull();
  });
});
