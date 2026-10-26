// JSON export/import: file format, strict validation, and merge/replace.
import { z } from "zod";
import { IMAGE_DATA_URL, MAX_IMAGE_BYTES, dataUrlBytes } from "./image";
import { CURRENCY, LIMITS, type Want } from "./wants";

export const BACKUP_APP = "my-wants";
export const BACKUP_VERSION = 1;
/**
 * Refuse files that couldn't plausibly be ours before parsing them. Generous
 * enough for hundreds of wants with photos, so the app can always re-import
 * what it exported (export warns above this size).
 */
export const MAX_BACKUP_BYTES = 250_000_000;
export const MAX_WANTS = 5000;

const isoDate = z.iso.datetime({ offset: true });
const cents = z.number().int().nonnegative().max(LIMITS.priceCents);
const text = (max: number) => z.string().trim().min(1).max(max);

const dependencySchema = z
  .strictObject({
    id: z.string().min(1).max(100),
    title: text(LIMITS.dependencyTitle),
    description: text(LIMITS.dependencyDescription).optional(),
    completed: z.boolean(),
    completedAt: isoDate.optional(),
  })
  .refine((d) => d.completed || d.completedAt === undefined, {
    message: "An incomplete dependency can't have a completion date",
    path: ["completedAt"],
  });

export const wantSchema = z
  .strictObject({
    id: z.string().min(1).max(100),
    name: text(LIMITS.name),
    priceCents: cents,
    currency: z.literal(CURRENCY),
    category: text(LIMITS.category).optional(),
    reason: text(LIMITS.reason).optional(),
    imageData: z
      .string()
      .regex(IMAGE_DATA_URL, "Images must be base64 JPEG, PNG or WebP data URLs")
      .refine((v) => dataUrlBytes(v) <= MAX_IMAGE_BYTES * 2, "Image is too large")
      .optional(),
    // Exactly three, enforced by the tuple.
    dependencies: z.tuple([dependencySchema, dependencySchema, dependencySchema]),
    createdAt: isoDate,
    updatedAt: isoDate,
    archivedAt: isoDate.optional(),
    purchasedAt: isoDate.optional(),
    finalPriceCents: cents.optional(),
  })
  .refine((w) => w.finalPriceCents === undefined || w.purchasedAt !== undefined, {
    message: "Only purchased wants can have a final price",
    path: ["finalPriceCents"],
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
    wants: z.array(wantSchema).max(MAX_WANTS),
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
  const pad = (n: number) => String(n).padStart(2, "0");
  return `my-wants-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export type ParseResult = { ok: true; wants: Want[] } | { ok: false; error: string };

const UNCHANGED = "Nothing on this device was changed.";

const FIELD_LABELS: Record<string, string> = {
  id: "id",
  name: "name",
  priceCents: "price",
  currency: "currency (only CAD is supported)",
  category: "category",
  reason: "reason",
  imageData: "photo",
  createdAt: "created date",
  updatedAt: "updated date",
  archivedAt: "archived date",
  purchasedAt: "purchase date",
  finalPriceCents: "final price",
  title: "title",
  description: "description",
  completed: "completed flag",
  completedAt: "completion date",
};

/** Plain-language reason for the first validation problem, naming the want. */
function describeIssue(issue: z.core.$ZodIssue, data: unknown): string {
  const [root, index, field, depIndex, depField] = issue.path;
  if (root !== "wants" || typeof index !== "number") {
    if (root === "wants" && issue.code === "custom") return "Two wants in the file share the same id.";
    return "The file's structure isn't what My Wants expects.";
  }
  const raw = (data as { wants?: { name?: unknown }[] }).wants?.[index];
  const name = typeof raw?.name === "string" && raw.name.trim() ? ` ("${raw.name.trim().slice(0, 40)}")` : "";
  const who = `Want ${index + 1}${name}`;
  if (issue.code === "unrecognized_keys") return `${who} has fields My Wants doesn't use: ${issue.keys.join(", ")}.`;
  if (field === "dependencies") {
    if (typeof depIndex !== "number") {
      return issue.code === "custom"
        ? `${who} has two dependencies with the same id.`
        : `${who} must have exactly three dependencies.`;
    }
    const label = typeof depField === "string" ? (FIELD_LABELS[depField] ?? depField) : "details";
    return `Dependency ${depIndex + 1} of ${who.charAt(0).toLowerCase()}${who.slice(1)} has an invalid ${label}.`;
  }
  if (issue.code === "custom") return `${who}: ${issue.message.charAt(0).toLowerCase()}${issue.message.slice(1)}.`;
  const label = typeof field === "string" ? (FIELD_LABELS[field] ?? field) : "details";
  return `${who} has a missing or invalid ${label}.`;
}

/** Parse and validate backup file text. Never throws. */
export function parseBackup(text: string): ParseResult {
  const fail = (reason: string): ParseResult => ({ ok: false, error: `${reason} ${UNCHANGED}` });
  if (text.length > MAX_BACKUP_BYTES) return fail("This file is too large to be a My Wants export.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("This file isn't valid JSON.");
  }
  if (typeof data !== "object" || data === null || (data as { app?: unknown }).app !== BACKUP_APP) {
    return fail("This file isn't a My Wants export.");
  }
  if ((data as { version?: unknown }).version !== BACKUP_VERSION) {
    return fail("This export is from an unsupported version of My Wants.");
  }
  const result = backupSchema.safeParse(data);
  if (!result.success) return fail(`Import failed. ${describeIssue(result.error.issues[0], data)}`);
  return { ok: true, wants: result.data.wants as Want[] };
}

/** Validate a single stored record (used when loading from IndexedDB). */
export function isValidWant(value: unknown): value is Want {
  return wantSchema.safeParse(value).success;
}

export interface MergePlan {
  /** The full list after merging. */
  wants: Want[];
  /** Wants to write (new or newer than the local copy). */
  changed: Want[];
  added: number;
  updated: number;
  unchanged: number;
}

/**
 * Merge imported wants into existing ones by id. A want only in the file is
 * added; a want in both keeps whichever copy was updated most recently, so
 * merging never discards newer local edits.
 */
export function planMerge(existing: Want[], incoming: Want[]): MergePlan {
  const byId = new Map(existing.map((w) => [w.id, w]));
  const changed: Want[] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const w of incoming) {
    const local = byId.get(w.id);
    if (!local) {
      added++;
      changed.push(w);
      byId.set(w.id, w);
    } else if (Date.parse(w.updatedAt) > Date.parse(local.updatedAt)) {
      updated++;
      changed.push(w);
      byId.set(w.id, w);
    } else {
      unchanged++;
    }
  }
  return { wants: [...byId.values()], changed, added, updated, unchanged };
}
