// Domain model and pure state transitions for wants.
// Everything here is framework-free so it can be unit tested directly.

export const DEPENDENCY_COUNT = 3;

export interface Dependency {
  id: string;
  title: string;
  /** ISO timestamp when completed, or null while incomplete. */
  completedAt: string | null;
}

export type Dependencies = [Dependency, Dependency, Dependency];

export interface Want {
  id: string;
  title: string;
  /** Integer minor units (cents) to avoid floating point errors. */
  priceCents: number;
  /** ISO 4217 currency code, e.g. "CAD". */
  currency: string;
  url: string | null;
  note: string | null;
  dependencies: Dependencies;
  purchasedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** True for the demo want inserted from the empty state. */
  isSample: boolean;
}

export type WantStatus = "locked" | "unlocked" | "purchased";

export interface WantInput {
  title: string;
  priceCents: number;
  currency: string;
  url?: string | null;
  note?: string | null;
  dependencyTitles: [string, string, string];
}

export class WantRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WantRuleError";
  }
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

// ---- Derived state -------------------------------------------------------

export function completedCount(want: Want): number {
  return want.dependencies.filter((d) => d.completedAt !== null).length;
}

/** Unlock is always derived, never stored. */
export function isUnlocked(want: Want): boolean {
  return completedCount(want) === DEPENDENCY_COUNT;
}

export function getStatus(want: Want): WantStatus {
  if (want.purchasedAt) return "purchased";
  return isUnlocked(want) ? "unlocked" : "locked";
}

// ---- Validation ----------------------------------------------------------

function cleanText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateInput(input: WantInput): string[] {
  const errors: string[] = [];
  if (!cleanText(input.title)) errors.push("Give your want a name.");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
    errors.push("Enter a valid price.");
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) errors.push("Use a 3-letter currency code.");
  if (input.dependencyTitles.length !== DEPENDENCY_COUNT) {
    errors.push("A want needs exactly three dependencies.");
  } else if (input.dependencyTitles.some((t) => !cleanText(t))) {
    errors.push("Fill in all three dependencies.");
  }
  const url = cleanText(input.url);
  if (url && !isHttpUrl(url)) errors.push("Links must start with http:// or https://.");
  return errors;
}

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function assertValid(input: WantInput) {
  const errors = validateInput(input);
  if (errors.length > 0) throw new WantRuleError(errors[0]);
}

// ---- Transitions ---------------------------------------------------------

export function createWant(
  input: WantInput,
  now: Date = new Date(),
  options: { isSample?: boolean } = {},
): Want {
  assertValid(input);
  const ts = now.toISOString();
  const [a, b, c] = input.dependencyTitles.map((title) => ({
    id: newId(),
    title: title.trim(),
    completedAt: null,
  }));
  return {
    id: newId(),
    title: input.title.trim(),
    priceCents: input.priceCents,
    currency: input.currency,
    url: cleanText(input.url),
    note: cleanText(input.note),
    dependencies: [a, b, c],
    purchasedAt: null,
    createdAt: ts,
    updatedAt: ts,
    isSample: options.isSample ?? false,
  };
}

export function updateWant(want: Want, input: WantInput, now: Date = new Date()): Want {
  assertValid(input);
  const frozen = want.purchasedAt !== null;
  const dependencies = want.dependencies.map((dep, i) => {
    const title = input.dependencyTitles[i].trim();
    if (frozen && title !== dep.title) {
      throw new WantRuleError("Dependencies are frozen once a want is purchased.");
    }
    return { ...dep, title };
  }) as Dependencies;
  return {
    ...want,
    title: input.title.trim(),
    priceCents: input.priceCents,
    currency: input.currency,
    url: cleanText(input.url),
    note: cleanText(input.note),
    dependencies,
    updatedAt: now.toISOString(),
  };
}

export function toggleDependency(want: Want, dependencyId: string, now: Date = new Date()): Want {
  if (want.purchasedAt) {
    throw new WantRuleError("Dependencies are frozen once a want is purchased.");
  }
  if (!want.dependencies.some((d) => d.id === dependencyId)) {
    throw new WantRuleError("That dependency does not belong to this want.");
  }
  const ts = now.toISOString();
  const dependencies = want.dependencies.map((d) =>
    d.id === dependencyId ? { ...d, completedAt: d.completedAt ? null : ts } : d,
  ) as Dependencies;
  return { ...want, dependencies, updatedAt: ts };
}

export function markPurchased(want: Want, now: Date = new Date()): Want {
  if (want.purchasedAt) throw new WantRuleError("This want is already purchased.");
  if (!isUnlocked(want)) {
    throw new WantRuleError("Complete all three dependencies before purchasing.");
  }
  const ts = now.toISOString();
  return { ...want, purchasedAt: ts, updatedAt: ts };
}

// ---- Sample data ---------------------------------------------------------

export function createSampleWant(now: Date = new Date()): Want {
  return createWant(
    {
      title: "Lagavulin 16",
      priceCents: 14384,
      currency: "CAD",
      note: "Sample want. Delete it whenever you like.",
      dependencyTitles: [
        "Run 3 times this week",
        "Finish the quarterly report",
        "Cook at home 5 nights",
      ],
    },
    now,
    { isSample: true },
  );
}

// ---- Sorting -------------------------------------------------------------

/** Most progress first, then newest. Purchased: most recent purchase first. */
export function sortWants(wants: Want[]): Want[] {
  return [...wants].sort((a, b) => {
    if (a.purchasedAt && b.purchasedAt) return b.purchasedAt.localeCompare(a.purchasedAt);
    const diff = completedCount(b) - completedCount(a);
    if (diff !== 0) return diff;
    return b.createdAt.localeCompare(a.createdAt);
  });
}
