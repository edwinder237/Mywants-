import { describe, expect, it } from "vitest";
import { backupFileName, createBackup, parseBackup, planMerge } from "@/lib/backup";
import {
  archiveWant,
  createDemoWant,
  createWant,
  markPurchased,
  toggleDependency,
  updateWant,
  type Want,
  type WantInput,
} from "@/lib/wants";

const input: WantInput = {
  name: "Bike",
  priceCents: 50000,
  dependencies: [{ title: "a" }, { title: "b", description: "detail" }, { title: "c" }],
};

function unlocked(name = "Bike"): Want {
  const w = createWant({ ...input, name });
  return w.dependencies.reduce((acc, d) => toggleDependency(acc, d.id), w);
}

const json = (v: unknown) => JSON.stringify(v);
const t = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n));

describe("export/import round trip", () => {
  it("restores exactly what was exported, across every state", () => {
    const wants = [
      createDemoWant(),
      createWant({ ...input, category: "Fun", reason: "why", imageData: "data:image/jpeg;base64,/9j/AAAA" }),
      unlocked(),
      markPurchased(unlocked(), { finalPriceCents: 45000 }),
      archiveWant(createWant(input)),
    ];
    const result = parseBackup(JSON.stringify(createBackup(wants), null, 2));
    expect(result).toEqual({ ok: true, wants });
  });

  it("names files by local date", () => {
    expect(backupFileName(new Date(2026, 2, 4, 10))).toBe("my-wants-2026-03-04.json");
  });

  it("accepts an empty backup", () => {
    expect(parseBackup(json(createBackup([])))).toEqual({ ok: true, wants: [] });
  });
});

describe("import validation", () => {
  const good = createBackup([createDemoWant()]);
  const withWant = (patch: Record<string, unknown>) => ({ ...good, wants: [{ ...good.wants[0], ...patch }] });
  const rejects = (v: unknown, error?: RegExp) =>
    expect(parseBackup(typeof v === "string" ? v : json(v))).toMatchObject({ ok: false, ...(error ? { error } : {}) });

  it("rejects malformed JSON and foreign files", () => {
    expect(parseBackup("{nope")).toEqual({
      ok: false,
      error: "This file isn't valid JSON. Nothing on this device was changed.",
    });
    rejects({ app: "other", wants: [] }, /isn't a My Wants export/);
    rejects([1, 2], /isn't a My Wants export/);
    rejects("null", /isn't a My Wants export/);
    rejects({ ...good, version: 2 }, /unsupported version/);
  });

  it("rejects wants without exactly three dependencies", () => {
    const deps = good.wants[0].dependencies;
    rejects(withWant({ dependencies: deps.slice(0, 2) }));
    rejects(withWant({ dependencies: [...deps, { ...deps[0], id: "x" }] }));
    rejects(withWant({ dependencies: [] }));
  });

  it("rejects duplicate want ids and duplicate dependency ids", () => {
    rejects({ ...good, wants: [good.wants[0], good.wants[0]] }, /same id/);
    const d = good.wants[0].dependencies;
    rejects(withWant({ dependencies: [d[0], d[0], d[2]] }));
  });

  it("enforces the PROJECT.md data model", () => {
    rejects(withWant({ currency: "USD" }));
    rejects(withWant({ priceCents: "143.84" }));
    rejects(withWant({ priceCents: 1.5 }));
    rejects(withWant({ priceCents: -1 }));
    rejects(withWant({ name: "   " }));
    rejects(withWant({ title: "legacy field" }));
    rejects(withWant({ unlocked: true }));
    rejects(withWant({ url: "https://example.com" }));
    rejects(withWant({ createdAt: "yesterday" }));
    rejects(withWant({ purchasedAt: null }));
    rejects(withWant({ imageData: "javascript:alert(1)" }));
    rejects(withWant({ imageData: "data:image/svg+xml;base64,PHN2Zz4=" }));
  });

  it("rejects a final price without a purchase and inconsistent completion", () => {
    rejects(withWant({ finalPriceCents: 100 }), /final price/);
    const d = good.wants[0].dependencies;
    rejects(withWant({ dependencies: [{ ...d[0], completed: false, completedAt: t(1).toISOString() }, d[1], d[2]] }));
  });

  it("explains problems in plain language, naming the want", () => {
    const deps = good.wants[0].dependencies;
    const msg = (v: unknown) => {
      const r = parseBackup(json(v));
      return r.ok ? "" : r.error;
    };
    expect(msg(withWant({ dependencies: deps.slice(0, 2) }))).toBe(
      'Import failed. Want 1 ("Lagavulin 16") must have exactly three dependencies. Nothing on this device was changed.',
    );
    expect(msg(withWant({ priceCents: 1.5 }))).toMatch(/Want 1 \("Lagavulin 16"\) has a missing or invalid price\./);
    expect(msg(withWant({ unlocked: true }))).toMatch(/fields My Wants doesn't use: unlocked/);
    expect(msg(withWant({ currency: "USD" }))).toMatch(/only CAD is supported/);
    expect(msg(withWant({ dependencies: [{ ...deps[0], title: " " }, deps[1], deps[2]] }))).toMatch(
      /Dependency 1 of want 1 .* invalid title/,
    );
    expect(msg({ ...good, wants: [good.wants[0], good.wants[0]] })).toMatch(/share the same id/);
  });

  it("accepts spec-shaped records with optional fields omitted", () => {
    const minimal = {
      id: "w1",
      name: "Camera",
      priceCents: 89999,
      currency: "CAD",
      dependencies: [
        { id: "d1", title: "One", completed: true },
        { id: "d2", title: "Two", completed: false },
        { id: "d3", title: "Three", description: "x", completed: true, completedAt: t(1).toISOString() },
      ],
      createdAt: t(0).toISOString(),
      updatedAt: t(0).toISOString(),
    };
    expect(parseBackup(json({ ...good, wants: [minimal] }))).toEqual({ ok: true, wants: [minimal] });
  });
});

describe("planMerge", () => {
  it("adds new wants, takes newer copies, keeps newer local edits, never deletes", () => {
    const localOnly = createWant({ ...input, name: "Local only" }, t(0));
    const shared = createWant({ ...input, name: "Shared" }, t(0));
    const newerInFile = updateWant(shared, { ...input, name: "Shared (file)" }, t(10));
    const sameOld = createWant({ ...input, name: "Same" }, t(0));
    const localNewer = updateWant(sameOld, { ...input, name: "Same (local edit)" }, t(20));
    const fileOnly = createWant({ ...input, name: "File only" }, t(0));

    const plan = planMerge([localOnly, shared, localNewer], [newerInFile, sameOld, fileOnly]);
    expect(plan).toMatchObject({ added: 1, updated: 1, unchanged: 1 });
    expect(plan.changed.map((w) => w.name).sort()).toEqual(["File only", "Shared (file)"]);
    expect(plan.wants.map((w) => w.name).sort()).toEqual(["File only", "Local only", "Same (local edit)", "Shared (file)"]);
  });

  it("is idempotent", () => {
    const wants = [createDemoWant(), unlocked()];
    const plan = planMerge(wants, wants);
    expect(plan).toMatchObject({ added: 0, updated: 0, unchanged: 2, changed: [] });
  });
});
