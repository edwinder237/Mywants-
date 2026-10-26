// Domain model and pure state transitions for wants (PROJECT.md §6).
// Framework-free so the rules can be unit tested directly.

export const DEPENDENCY_COUNT = 3;
export const CURRENCY = "CAD" as const;

export const LIMITS = {
  name: 120,
  category: 40,
  reason: 1000,
  dependencyTitle: 120,
  dependencyDescription: 500,
  /** CAD 99,999,999.99 */
  priceCents: 9_999_999_999,
} as const;

export type Dependency = {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  completedAt?: string;
};

export type Dependencies = [Dependency, Dependency, Dependency];

export type Want = {
  id: string;
  name: string;
  priceCents: number;
  currency: typeof CURRENCY;
  category?: string;
  reason?: string;
  /** Compressed JPEG data URL stored locally. */
  imageData?: string;
  dependencies: Dependencies;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  purchasedAt?: string;
  finalPriceCents?: number;
};

/** Fixed id of the optional example want, so it is always labelled as an example. */
export const DEMO_WANT_ID = "demo-lagavulin-16";

export function isDemo(want: Pick<Want, "id">): boolean {
  return want.id === DEMO_WANT_ID;
}

/** Precedence: purchased > archived > unlocked > locked. */
export type WantStatus = "locked" | "unlocked" | "purchased" | "archived";

export interface DependencyInput {
  title: string;
  description?: string;
}

export interface WantInput {
  name: string;
  priceCents: number;
  category?: string;
  reason?: string;
  /** Data URL, or undefined for no image. */
  imageData?: string;
  dependencies: [DependencyInput, DependencyInput, DependencyInput];
}

export interface PurchaseInput {
  /** Defaults to now. Must not be in the future. */
  purchasedAt?: Date;
  finalPriceCents?: number;
}

export class WantRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WantRuleError";
  }
}

export function newId(): string {
  const c = globalThis.crypto;
  // randomUUID needs a secure context; plain-http LAN testing on a phone lacks one.
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---- Derived state -------------------------------------------------------

export function completedCount(want: Pick<Want, "dependencies">): number {
  return want.dependencies.filter((d) => d.completed).length;
}

/** All three dependencies complete. Always derived, never stored. */
export function allComplete(want: Pick<Want, "dependencies">): boolean {
  return completedCount(want) === DEPENDENCY_COUNT;
}

export function getStatus(want: Want): WantStatus {
  if (want.purchasedAt) return "purchased";
  if (want.archivedAt) return "archived";
  return allComplete(want) ? "unlocked" : "locked";
}

// ---- Validation ----------------------------------------------------------

function clean(value: string | undefined | null): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isValidCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= LIMITS.priceCents;
}

/** Returns user-facing messages; empty when the input is valid. */
export function validateInput(input: WantInput): string[] {
  const errors: string[] = [];
  const name = clean(input.name);
  if (!name) errors.push("Give your want a name.");
  else if (name.length > LIMITS.name) errors.push(`Keep the name under ${LIMITS.name} characters.`);
  if (!isValidCents(input.priceCents)) errors.push("Enter a valid price.");
  if ((clean(input.category)?.length ?? 0) > LIMITS.category) {
    errors.push(`Keep the category under ${LIMITS.category} characters.`);
  }
  if ((clean(input.reason)?.length ?? 0) > LIMITS.reason) {
    errors.push(`Keep the reason under ${LIMITS.reason} characters.`);
  }
  if (!Array.isArray(input.dependencies) || input.dependencies.length !== DEPENDENCY_COUNT) {
    errors.push("A want needs exactly three dependencies.");
  } else {
    if (input.dependencies.some((d) => !clean(d.title))) errors.push("Give all three dependencies a title.");
    if (input.dependencies.some((d) => (clean(d.title)?.length ?? 0) > LIMITS.dependencyTitle)) {
      errors.push(`Keep dependency titles under ${LIMITS.dependencyTitle} characters.`);
    }
    if (input.dependencies.some((d) => (clean(d.description)?.length ?? 0) > LIMITS.dependencyDescription)) {
      errors.push(`Keep dependency descriptions under ${LIMITS.dependencyDescription} characters.`);
    }
  }
  if (input.imageData !== undefined && !/^data:image\/(jpeg|png|webp);base64,/.test(input.imageData)) {
    errors.push("That image couldn't be saved.");
  }
  return errors;
}

function assertValid(input: WantInput) {
  const errors = validateInput(input);
  if (errors.length > 0) throw new WantRuleError(errors[0]);
}

/** Drop keys whose value is undefined so stored records match the optional-field model. */
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

// ---- Transitions ---------------------------------------------------------

export function createWant(input: WantInput, now: Date = new Date(), options: { id?: string } = {}): Want {
  assertValid(input);
  const ts = now.toISOString();
  const deps = input.dependencies.map((d) =>
    compact<Dependency>({ id: newId(), title: d.title.trim(), description: clean(d.description), completed: false }),
  ) as Dependencies;
  return compact<Want>({
    id: options.id ?? newId(),
    name: input.name.trim(),
    priceCents: input.priceCents,
    currency: CURRENCY,
    category: clean(input.category),
    reason: clean(input.reason),
    imageData: input.imageData,
    dependencies: deps,
    createdAt: ts,
    updatedAt: ts,
  });
}

/**
 * Edit details and dependency wording. Completion state is kept. Purchase
 * details can be corrected on purchased wants via `purchase`.
 */
export function updateWant(
  want: Want,
  input: WantInput,
  now: Date = new Date(),
  purchase?: PurchaseInput,
): Want {
  assertValid(input);
  const dependencies = want.dependencies.map((dep, i) =>
    compact<Dependency>({
      ...dep,
      title: input.dependencies[i].title.trim(),
      description: clean(input.dependencies[i].description),
    }),
  ) as Dependencies;
  let next: Want = {
    ...want,
    name: input.name.trim(),
    priceCents: input.priceCents,
    category: clean(input.category),
    reason: clean(input.reason),
    imageData: input.imageData,
    dependencies,
    updatedAt: now.toISOString(),
  };
  if (purchase && want.purchasedAt) {
    const purchasedAt = purchase.purchasedAt ?? new Date(want.purchasedAt);
    next = { ...next, ...purchaseFields({ ...purchase, purchasedAt }, now) };
  }
  return compact(next);
}

/**
 * Check or uncheck a dependency. Allowed in every state: unchecking relocks an
 * active want, while purchased and archived wants keep their status
 * (precedence in getStatus).
 */
export function toggleDependency(want: Want, dependencyId: string, now: Date = new Date()): Want {
  if (!want.dependencies.some((d) => d.id === dependencyId)) {
    throw new WantRuleError("That dependency does not belong to this want.");
  }
  const ts = now.toISOString();
  const dependencies = want.dependencies.map((d) => {
    if (d.id !== dependencyId) return d;
    if (d.completed) {
      const rest = { ...d };
      delete rest.completedAt;
      return { ...rest, completed: false };
    }
    return { ...d, completed: true, completedAt: ts };
  }) as Dependencies;
  return { ...want, dependencies, updatedAt: ts };
}

function purchaseFields(input: PurchaseInput, now: Date): Pick<Want, "purchasedAt" | "finalPriceCents"> {
  const when = input.purchasedAt ?? now;
  if (Number.isNaN(when.getTime())) throw new WantRuleError("Enter a valid purchase date.");
  // Allow a day of slack for time zones; a date picker only gives a calendar day.
  if (when.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    throw new WantRuleError("The purchase date can't be in the future.");
  }
  if (input.finalPriceCents !== undefined && !isValidCents(input.finalPriceCents)) {
    throw new WantRuleError("Enter a valid final price.");
  }
  return { purchasedAt: when.toISOString(), finalPriceCents: input.finalPriceCents };
}

/** Only an unlocked want (3/3, not archived, not purchased) can be purchased. */
export function markPurchased(want: Want, input: PurchaseInput = {}, now: Date = new Date()): Want {
  const status = getStatus(want);
  if (status === "purchased") throw new WantRuleError("This want is already purchased.");
  if (status === "archived") throw new WantRuleError("Restore this want before marking it purchased.");
  if (status === "locked") throw new WantRuleError("Complete all three dependencies before purchasing.");
  return compact({ ...want, ...purchaseFields(input, now), updatedAt: now.toISOString() });
}

export function archiveWant(want: Want, now: Date = new Date()): Want {
  if (want.purchasedAt) throw new WantRuleError("Purchased wants can't be archived.");
  if (want.archivedAt) throw new WantRuleError("This want is already archived.");
  const ts = now.toISOString();
  return { ...want, archivedAt: ts, updatedAt: ts };
}

export function restoreWant(want: Want, now: Date = new Date()): Want {
  if (!want.archivedAt) throw new WantRuleError("This want isn't archived.");
  const rest = { ...want };
  delete rest.archivedAt;
  return { ...rest, updatedAt: now.toISOString() };
}

// ---- Example data --------------------------------------------------------

export function createDemoWant(now: Date = new Date()): Want {
  return createWant(
    {
      name: "Lagavulin 16",
      priceCents: 14384,
      category: "Treat",
      reason: "Example only. Delete it whenever you like.",
      dependencies: [
        { title: "Pay off one credit card" },
        { title: "Save CAD 145" },
        { title: "Stay within spending plan for 30 days" },
      ],
    },
    now,
    { id: DEMO_WANT_ID },
  );
}

// ---- Sorting -------------------------------------------------------------

function latest(want: Want): string {
  return want.purchasedAt ?? want.archivedAt ?? want.createdAt;
}

/** Locked/unlocked: most progress first, then newest. Purchased/archived: most recent first. */
export function sortWants(wants: Want[]): Want[] {
  return [...wants].sort((a, b) => {
    const sa = getStatus(a);
    const sb = getStatus(b);
    if ((sa === "purchased" || sa === "archived") && (sb === "purchased" || sb === "archived")) {
      return latest(b).localeCompare(latest(a));
    }
    const diff = completedCount(b) - completedCount(a);
    if (diff !== 0) return diff;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Distinct categories in use, for form suggestions. */
export function categoriesOf(wants: Want[]): string[] {
  const seen = new Map<string, string>();
  for (const w of wants) {
    if (w.category && !seen.has(w.category.toLowerCase())) seen.set(w.category.toLowerCase(), w.category);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
