import { describe, expect, it } from "vitest";
import {
  DEMO_WANT_ID,
  archiveWant,
  categoriesOf,
  completedCount,
  createDemoWant,
  createWant,
  getStatus,
  isDemo,
  markPurchased,
  newId,
  restoreWant,
  sortWants,
  toggleDependency,
  updateWant,
  validateInput,
  WantRuleError,
  type Want,
  type WantInput,
} from "@/lib/wants";

const input: WantInput = {
  name: "  Headphones ",
  priceCents: 29999,
  category: " Audio ",
  reason: "  Commute is loud ",
  dependencies: [{ title: "Run 10k", description: "  before May " }, { title: "Ship the feature" }, { title: "Sell old pair" }],
};

const t = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n));
const NOW = t(100);

function completeAll(want: Want): Want {
  return want.dependencies.reduce((w, d) => (d.completed ? w : toggleDependency(w, d.id, t(1))), want);
}

describe("createWant", () => {
  it("creates a locked CAD want with exactly three incomplete dependencies", () => {
    const w = createWant(input, t(0));
    expect(w).toMatchObject({ name: "Headphones", priceCents: 29999, currency: "CAD", category: "Audio", reason: "Commute is loud" });
    expect(w.dependencies).toHaveLength(3);
    expect(w.dependencies[0]).toMatchObject({ title: "Run 10k", description: "before May", completed: false });
    expect(w.dependencies[1]).not.toHaveProperty("description");
    expect(w.dependencies.every((d) => !d.completed && d.completedAt === undefined)).toBe(true);
    expect(new Set(w.dependencies.map((d) => d.id)).size).toBe(3);
    expect(getStatus(w)).toBe("locked");
    // Optional fields are omitted, never null, and unlock is never stored.
    for (const key of ["purchasedAt", "archivedAt", "finalPriceCents", "imageData", "unlocked"]) {
      expect(w).not.toHaveProperty(key);
    }
  });

  it("omits blank optional fields", () => {
    const w = createWant({ ...input, category: "  ", reason: "" }, t(0));
    expect(w).not.toHaveProperty("category");
    expect(w).not.toHaveProperty("reason");
  });

  it("rejects fewer or more than three dependencies and blank titles", () => {
    const two = input.dependencies.slice(0, 2) as unknown as WantInput["dependencies"];
    const four = [...input.dependencies, { title: "x" }] as unknown as WantInput["dependencies"];
    expect(() => createWant({ ...input, dependencies: two })).toThrow(/exactly three/);
    expect(() => createWant({ ...input, dependencies: four })).toThrow(/exactly three/);
    expect(() =>
      createWant({ ...input, dependencies: [{ title: "a" }, { title: "  " }, { title: "c" }] }),
    ).toThrow(WantRuleError);
  });

  it("validates name, price, lengths and image", () => {
    expect(validateInput({ ...input, name: " " })).not.toHaveLength(0);
    expect(validateInput({ ...input, name: "x".repeat(121) })).not.toHaveLength(0);
    expect(validateInput({ ...input, priceCents: -1 })).not.toHaveLength(0);
    expect(validateInput({ ...input, priceCents: 1.5 })).not.toHaveLength(0);
    expect(validateInput({ ...input, priceCents: Number.MAX_SAFE_INTEGER })).not.toHaveLength(0);
    expect(validateInput({ ...input, category: "x".repeat(41) })).not.toHaveLength(0);
    expect(validateInput({ ...input, imageData: "https://example.com/a.png" })).not.toHaveLength(0);
    expect(validateInput({ ...input, imageData: "data:image/jpeg;base64,AAAA" })).toHaveLength(0);
    expect(validateInput(input)).toHaveLength(0);
  });
});

describe("derived status", () => {
  it("unlocks only at 3/3", () => {
    let w = createWant(input, t(0));
    for (let i = 0; i < 3; i++) {
      expect(getStatus(w)).toBe("locked");
      expect(completedCount(w)).toBe(i);
      w = toggleDependency(w, w.dependencies[i].id, t(i + 1));
    }
    expect(getStatus(w)).toBe("unlocked");
    expect(w.dependencies[2]).toMatchObject({ completed: true, completedAt: t(3).toISOString() });
  });

  it("relocks an unpurchased want when a dependency is unchecked", () => {
    const unlocked = completeAll(createWant(input, t(0)));
    const relocked = toggleDependency(unlocked, unlocked.dependencies[1].id, t(5));
    expect(getStatus(relocked)).toBe("locked");
    expect(relocked.dependencies[1].completed).toBe(false);
    expect(relocked.dependencies[1]).not.toHaveProperty("completedAt");
  });

  it("applies precedence purchased > archived > unlocked > locked", () => {
    const base = createWant(input, t(0));
    const unlocked = completeAll(base);
    expect(getStatus({ ...base, archivedAt: t(1).toISOString() })).toBe("archived");
    expect(getStatus({ ...unlocked, archivedAt: t(1).toISOString() })).toBe("archived");
    expect(getStatus({ ...unlocked, purchasedAt: t(1).toISOString(), archivedAt: t(1).toISOString() })).toBe("purchased");
    expect(getStatus({ ...base, purchasedAt: t(1).toISOString() })).toBe("purchased");
  });

  it("keeps a purchased want purchased when a dependency is unchecked", () => {
    const bought = markPurchased(completeAll(createWant(input, t(0))), {}, NOW);
    const after = toggleDependency(bought, bought.dependencies[0].id, NOW);
    expect(getStatus(after)).toBe("purchased");
    expect(completedCount(after)).toBe(2);
  });

  it("does not mutate its input", () => {
    const w = createWant(input, t(0));
    toggleDependency(w, w.dependencies[0].id);
    expect(w.dependencies[0].completed).toBe(false);
  });

  it("rejects unknown dependency ids", () => {
    expect(() => toggleDependency(createWant(input), "nope")).toThrow(WantRuleError);
  });
});

describe("markPurchased", () => {
  it("refuses locked and archived wants", () => {
    const w = createWant(input, t(0));
    expect(() => markPurchased(w, {}, NOW)).toThrow(/Complete all three/);
    const two = toggleDependency(toggleDependency(w, w.dependencies[0].id), w.dependencies[1].id);
    expect(() => markPurchased(two, {}, NOW)).toThrow(WantRuleError);
    const archived = archiveWant(completeAll(w), t(2));
    expect(() => markPurchased(archived, {}, NOW)).toThrow(/Restore/);
  });

  it("defaults the purchase date to now and omits final price", () => {
    const bought = markPurchased(completeAll(createWant(input, t(0))), {}, NOW);
    expect(bought.purchasedAt).toBe(NOW.toISOString());
    expect(bought).not.toHaveProperty("finalPriceCents");
    expect(() => markPurchased(bought, {}, NOW)).toThrow(/already/);
  });

  it("records an optional past date and final price", () => {
    const when = t(50);
    const bought = markPurchased(completeAll(createWant(input, t(0))), { purchasedAt: when, finalPriceCents: 25000 }, NOW);
    expect(bought).toMatchObject({ purchasedAt: when.toISOString(), finalPriceCents: 25000, priceCents: 29999 });
  });

  it("rejects future dates and invalid final prices", () => {
    const unlocked = completeAll(createWant(input, t(0)));
    const future = new Date(NOW.getTime() + 3 * 24 * 3600 * 1000);
    expect(() => markPurchased(unlocked, { purchasedAt: future }, NOW)).toThrow(/future/);
    expect(() => markPurchased(unlocked, { purchasedAt: new Date("nope") }, NOW)).toThrow(/valid purchase date/);
    expect(() => markPurchased(unlocked, { finalPriceCents: -5 }, NOW)).toThrow(/final price/);
    expect(() => markPurchased(unlocked, { finalPriceCents: 10.5 }, NOW)).toThrow(/final price/);
  });
});

describe("archive and restore", () => {
  it("archives locked or unlocked wants and restores them to their derived state", () => {
    const locked = createWant(input, t(0));
    const archived = archiveWant(locked, t(1));
    expect(getStatus(archived)).toBe("archived");
    expect(archived.archivedAt).toBe(t(1).toISOString());
    const restored = restoreWant(archived, t(2));
    expect(restored).not.toHaveProperty("archivedAt");
    expect(getStatus(restored)).toBe("locked");

    const unlocked = completeAll(locked);
    expect(getStatus(restoreWant(archiveWant(unlocked, t(3)), t(4)))).toBe("unlocked");
  });

  it("refuses to archive purchased or archived wants, or restore active ones", () => {
    const w = createWant(input, t(0));
    const bought = markPurchased(completeAll(w), {}, NOW);
    expect(() => archiveWant(bought)).toThrow(/Purchased/);
    expect(() => archiveWant(archiveWant(w))).toThrow(/already archived/);
    expect(() => restoreWant(w)).toThrow(/isn't archived/);
  });

  it("allows dependency changes while archived without leaving the archive", () => {
    const archived = archiveWant(createWant(input, t(0)), t(1));
    const all = completeAll(archived);
    expect(getStatus(all)).toBe("archived");
  });
});

describe("updateWant", () => {
  it("edits details and dependency wording while keeping ids and completion", () => {
    let w = createWant(input, t(0));
    w = toggleDependency(w, w.dependencies[0].id, t(1));
    const edited = updateWant(
      w,
      {
        ...input,
        name: "Better headphones",
        priceCents: 34999,
        category: "",
        dependencies: [{ title: "Run 12k", description: "" }, { title: "Ship it", description: "by Friday" }, { title: "Sell" }],
      },
      t(2),
    );
    expect(edited).toMatchObject({ name: "Better headphones", priceCents: 34999, updatedAt: t(2).toISOString() });
    expect(edited).not.toHaveProperty("category");
    expect(edited.dependencies.map((d) => d.id)).toEqual(w.dependencies.map((d) => d.id));
    expect(edited.dependencies[0]).toMatchObject({ title: "Run 12k", completed: true, completedAt: t(1).toISOString() });
    expect(edited.dependencies[0]).not.toHaveProperty("description");
    expect(edited.dependencies[1].description).toBe("by Friday");
  });

  it("adds and removes the image", () => {
    const w = createWant(input, t(0));
    const withImage = updateWant(w, { ...input, imageData: "data:image/jpeg;base64,AAAA" }, t(1));
    expect(withImage.imageData).toBe("data:image/jpeg;base64,AAAA");
    expect(updateWant(withImage, input, t(2))).not.toHaveProperty("imageData");
  });

  it("corrects purchase details only on purchased wants", () => {
    const w = completeAll(createWant(input, t(0)));
    const bought = markPurchased(w, { finalPriceCents: 100 }, NOW);
    const fixed = updateWant(bought, input, NOW, { purchasedAt: t(60), finalPriceCents: undefined });
    expect(fixed.purchasedAt).toBe(t(60).toISOString());
    expect(fixed).not.toHaveProperty("finalPriceCents");
    expect(updateWant(w, input, NOW, { purchasedAt: t(60) })).not.toHaveProperty("purchasedAt");
  });
});

describe("demo want", () => {
  it("is the clearly marked Lagavulin 16 example at CAD 143.84 with the spec's dependencies", () => {
    const d = createDemoWant(t(0));
    expect(d).toMatchObject({ id: DEMO_WANT_ID, name: "Lagavulin 16", priceCents: 14384, currency: "CAD" });
    expect(d.dependencies.map((x) => x.title)).toEqual([
      "Pay off one credit card",
      "Save CAD 145",
      "Stay within spending plan for 30 days",
    ]);
    expect(isDemo(d)).toBe(true);
    expect(isDemo(createWant(input))).toBe(false);
  });
});

describe("helpers", () => {
  it("sorts active wants by progress then newest, and closed wants by recency", () => {
    const a = createWant({ ...input, name: "A" }, t(1));
    const b = createWant({ ...input, name: "B" }, t(2));
    const c0 = createWant({ ...input, name: "C" }, t(0));
    const c = toggleDependency(c0, c0.dependencies[0].id, t(3));
    expect(sortWants([a, b, c]).map((w) => w.name)).toEqual(["C", "B", "A"]);
    const old = archiveWant(createWant({ ...input, name: "Old" }, t(0)), t(5));
    const recent = archiveWant(createWant({ ...input, name: "Recent" }, t(0)), t(9));
    expect(sortWants([old, recent]).map((w) => w.name)).toEqual(["Recent", "Old"]);
  });

  it("lists distinct categories case-insensitively", () => {
    const wants = ["Audio", "audio", "Books", undefined].map((category) => createWant({ ...input, category }));
    expect(categoriesOf(wants)).toEqual(["Audio", "Books"]);
  });

  it("generates RFC 4122 ids even without randomUUID", () => {
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(globalThis.crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});
