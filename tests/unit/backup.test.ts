import { describe, expect, it } from "vitest";
import { backupFileName, createBackup, parseBackup } from "@/lib/backup";
import { createSampleWant, createWant, markPurchased, toggleDependency, type Want } from "@/lib/wants";

function unlocked(): Want {
  const w = createWant({ title: "Bike", priceCents: 50000, currency: "CAD", dependencyTitles: ["a", "b", "c"] });
  return w.dependencies.reduce((acc, d) => toggleDependency(acc, d.id), w);
}

const json = (v: unknown) => JSON.stringify(v);

describe("export/import round trip", () => {
  it("restores exactly what was exported", () => {
    const wants = [createSampleWant(), unlocked(), markPurchased(unlocked())];
    const text = JSON.stringify(createBackup(wants), null, 2);
    const result = parseBackup(text);
    expect(result).toEqual({ ok: true, wants });
  });

  it("names files by date", () => {
    expect(backupFileName(new Date("2026-03-04T10:00:00Z"))).toBe("my-wants-2026-03-04.json");
  });
});

describe("import validation", () => {
  const good = createBackup([createSampleWant()]);
  const withWant = (patch: Record<string, unknown>) => ({ ...good, wants: [{ ...good.wants[0], ...patch }] });

  it("rejects malformed JSON", () => {
    expect(parseBackup("{nope")).toEqual({ ok: false, error: "This file isn't valid JSON." });
  });

  it("rejects files from other apps", () => {
    expect(parseBackup(json({ app: "other", wants: [] }))).toMatchObject({ ok: false, error: /isn't a My Wants export/ });
    expect(parseBackup(json([1, 2]))).toMatchObject({ ok: false });
    expect(parseBackup("null")).toMatchObject({ ok: false });
  });

  it("rejects unsupported versions", () => {
    expect(parseBackup(json({ ...good, version: 2 }))).toMatchObject({ ok: false });
  });

  it("rejects wants without exactly three dependencies", () => {
    const deps = good.wants[0].dependencies;
    expect(parseBackup(json(withWant({ dependencies: deps.slice(0, 2) })))).toMatchObject({ ok: false });
    expect(parseBackup(json(withWant({ dependencies: [...deps, { ...deps[0], id: "x" }] })))).toMatchObject({
      ok: false,
    });
  });

  it("rejects purchased wants with incomplete dependencies", () => {
    const r = parseBackup(json(withWant({ purchasedAt: new Date().toISOString() })));
    expect(r).toMatchObject({ ok: false, error: /all three dependencies/ });
  });

  it("rejects duplicate want ids and duplicate dependency ids", () => {
    expect(parseBackup(json({ ...good, wants: [good.wants[0], good.wants[0]] }))).toMatchObject({
      ok: false,
      error: /same id/,
    });
    const d = good.wants[0].dependencies;
    expect(parseBackup(json(withWant({ dependencies: [d[0], d[0], d[2]] })))).toMatchObject({ ok: false });
  });

  it("rejects wrong field types, unknown fields and unsafe links", () => {
    expect(parseBackup(json(withWant({ priceCents: "143.84" })))).toMatchObject({ ok: false });
    expect(parseBackup(json(withWant({ priceCents: 1.5 })))).toMatchObject({ ok: false });
    expect(parseBackup(json(withWant({ title: "   " })))).toMatchObject({ ok: false });
    expect(parseBackup(json(withWant({ url: "javascript:alert(1)" })))).toMatchObject({ ok: false });
    expect(parseBackup(json(withWant({ unlocked: true })))).toMatchObject({ ok: false });
    expect(parseBackup(json(withWant({ createdAt: "yesterday" })))).toMatchObject({ ok: false });
  });

  it("accepts an empty backup", () => {
    expect(parseBackup(json(createBackup([])))).toEqual({ ok: true, wants: [] });
  });
});
