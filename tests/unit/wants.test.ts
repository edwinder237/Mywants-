import { describe, expect, it } from "vitest";
import {
  completedCount,
  createSampleWant,
  createWant,
  getStatus,
  isUnlocked,
  markPurchased,
  sortWants,
  toggleDependency,
  updateWant,
  validateInput,
  WantRuleError,
  type Want,
  type WantInput,
} from "@/lib/wants";

const input: WantInput = {
  title: "  Headphones ",
  priceCents: 29999,
  currency: "CAD",
  dependencyTitles: ["Run 10k", "Ship the feature", "Sell old pair"],
};

const t = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n));

function completeAll(want: Want): Want {
  return want.dependencies.reduce((w, d) => toggleDependency(w, d.id, t(1)), want);
}

describe("createWant", () => {
  it("creates a locked want with exactly three incomplete dependencies", () => {
    const w = createWant(input, t(0));
    expect(w.title).toBe("Headphones");
    expect(w.dependencies).toHaveLength(3);
    expect(w.dependencies.every((d) => d.completedAt === null)).toBe(true);
    expect(new Set(w.dependencies.map((d) => d.id)).size).toBe(3);
    expect(getStatus(w)).toBe("locked");
    expect(w.purchasedAt).toBeNull();
    expect(w).not.toHaveProperty("unlocked");
  });

  it("rejects blank dependencies, wrong counts and bad fields", () => {
    expect(() => createWant({ ...input, dependencyTitles: ["a", " ", "c"] })).toThrow(WantRuleError);
    expect(() =>
      createWant({ ...input, dependencyTitles: ["a", "b"] as unknown as WantInput["dependencyTitles"] }),
    ).toThrow(/exactly three/);
    expect(() =>
      createWant({ ...input, dependencyTitles: ["a", "b", "c", "d"] as unknown as WantInput["dependencyTitles"] }),
    ).toThrow(/exactly three/);
    expect(validateInput({ ...input, title: "" })).not.toHaveLength(0);
    expect(validateInput({ ...input, priceCents: -1 })).not.toHaveLength(0);
    expect(validateInput({ ...input, priceCents: 1.5 })).not.toHaveLength(0);
    expect(validateInput({ ...input, currency: "cad" })).not.toHaveLength(0);
    expect(validateInput({ ...input, url: "javascript:alert(1)" })).not.toHaveLength(0);
    expect(validateInput({ ...input, url: "https://example.com" })).toHaveLength(0);
  });
});

describe("unlock is derived from dependencies", () => {
  it("unlocks only when all three are complete", () => {
    let w = createWant(input, t(0));
    w = toggleDependency(w, w.dependencies[0].id, t(1));
    expect(completedCount(w)).toBe(1);
    w = toggleDependency(w, w.dependencies[1].id, t(2));
    expect(isUnlocked(w)).toBe(false);
    w = toggleDependency(w, w.dependencies[2].id, t(3));
    expect(isUnlocked(w)).toBe(true);
    expect(getStatus(w)).toBe("unlocked");
    expect(w.dependencies[2].completedAt).toBe(t(3).toISOString());
  });

  it("re-locks when a dependency is unchecked before purchase", () => {
    const unlocked = completeAll(createWant(input, t(0)));
    const relocked = toggleDependency(unlocked, unlocked.dependencies[1].id, t(5));
    expect(getStatus(relocked)).toBe("locked");
    expect(relocked.dependencies[1].completedAt).toBeNull();
  });

  it("does not mutate the original want", () => {
    const w = createWant(input, t(0));
    toggleDependency(w, w.dependencies[0].id);
    expect(w.dependencies[0].completedAt).toBeNull();
  });

  it("rejects unknown dependency ids", () => {
    expect(() => toggleDependency(createWant(input), "nope")).toThrow(WantRuleError);
  });
});

describe("markPurchased", () => {
  it("refuses while locked", () => {
    let w = createWant(input);
    expect(() => markPurchased(w)).toThrow(/Complete all three/);
    w = toggleDependency(toggleDependency(w, w.dependencies[0].id), w.dependencies[1].id);
    expect(() => markPurchased(w)).toThrow(WantRuleError);
  });

  it("purchases an unlocked want and freezes dependencies", () => {
    const bought = markPurchased(completeAll(createWant(input, t(0))), t(9));
    expect(getStatus(bought)).toBe("purchased");
    expect(bought.purchasedAt).toBe(t(9).toISOString());
    expect(() => toggleDependency(bought, bought.dependencies[0].id)).toThrow(/frozen/);
    expect(() => markPurchased(bought)).toThrow(/already/);
    expect(() =>
      updateWant(bought, { ...input, dependencyTitles: ["changed", "Ship the feature", "Sell old pair"] }),
    ).toThrow(/frozen/);
    // Non-dependency fields stay editable.
    expect(updateWant(bought, { ...input, title: "Better headphones" }).title).toBe("Better headphones");
  });
});

describe("updateWant", () => {
  it("keeps completion state when dependency wording changes", () => {
    let w = createWant(input, t(0));
    w = toggleDependency(w, w.dependencies[0].id, t(1));
    const edited = updateWant(w, { ...input, dependencyTitles: ["Run 12k", "Ship it", "Sell"] }, t(2));
    expect(edited.dependencies[0].title).toBe("Run 12k");
    expect(edited.dependencies[0].completedAt).toBe(t(1).toISOString());
    expect(edited.dependencies.map((d) => d.id)).toEqual(w.dependencies.map((d) => d.id));
    expect(edited.updatedAt).toBe(t(2).toISOString());
  });
});

describe("sample want", () => {
  it("is the clearly marked Lagavulin 16 at CAD 143.84", () => {
    const s = createSampleWant();
    expect(s).toMatchObject({ title: "Lagavulin 16", priceCents: 14384, currency: "CAD", isSample: true });
    expect(s.dependencies).toHaveLength(3);
  });
});

describe("sortWants", () => {
  it("orders by progress, then newest", () => {
    const a = createWant({ ...input, title: "A" }, t(1));
    const b = createWant({ ...input, title: "B" }, t(2));
    const c0 = createWant({ ...input, title: "C" }, t(0));
    const c = toggleDependency(c0, c0.dependencies[0].id, t(3));
    expect(sortWants([a, b, c]).map((w) => w.title)).toEqual(["C", "B", "A"]);
  });
});
