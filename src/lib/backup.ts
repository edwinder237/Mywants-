// JSON export/import format and strict validation for imports.
import { z } from "zod";
import type { Want } from "./wants";

export const BACKUP_APP = "my-wants";
export const BACKUP_VERSION = 1;

const isoDate = z.iso.datetime({ offset: true });

const dependencySchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  completedAt: isoDate.nullable(),
});

const wantSchema = z
  .strictObject({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    priceCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code"),
    url: z
      .string()
      .refine((v) => /^https?:\/\//i.test(v), "Links must start with http:// or https://")
      .nullable(),
    note: z.string().max(2000).nullable(),
    // Exactly three, enforced by the tuple.
    dependencies: z.tuple([dependencySchema, dependencySchema, dependencySchema]),
    purchasedAt: isoDate.nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
    isSample: z.boolean(),
  })
  .refine((w) => !w.purchasedAt || w.dependencies.every((d) => d.completedAt !== null), {
    message: "A purchased want must have all three dependencies completed",
    path: ["purchasedAt"],
  })
  .refine((w) => new Set(w.dependencies.map((d) => d.id)).size === 3, {
    message: "Dependency ids must be unique",
    path: ["dependencies"],
  });

export const backupSchema = z
  .strictObject({
    app: z.literal(BACKUP_APP),
    version: z.literal(BACKUP_VERSION),
    exportedAt: isoDate,
    wants: z.array(wantSchema),
  })
  .refine((b) => new Set(b.wants.map((w) => w.id)).size === b.wants.length, {
    message: "Two wants share the same id",
    path: ["wants"],
  });

export type Backup = z.infer<typeof backupSchema>;

export function createBackup(wants: Want[], now: Date = new Date()): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), wants };
}

export function backupFileName(now: Date = new Date()): string {
  return `my-wants-${now.toISOString().slice(0, 10)}.json`;
}

export type ParseResult = { ok: true; wants: Want[] } | { ok: false; error: string };

/** Parse and validate backup file text. Never throws. */
export function parseBackup(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  if (typeof data === "object" && data !== null && (data as { app?: unknown }).app !== BACKUP_APP) {
    return { ok: false, error: "This file isn't a My Wants export." };
  }
  const result = backupSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path.length ? ` (at ${issue.path.join(".")})` : "";
    return { ok: false, error: `Import failed: ${issue.message}${where}.` };
  }
  return { ok: true, wants: result.data.wants as Want[] };
}
