// Shared helpers for the end-to-end suite. Not a spec file (no .spec suffix),
// so Playwright only loads it through imports.
import { expect, type Locator, type Page } from "@playwright/test";

export const DEMO = "Lagavulin 16";
export const TAGLINE = "Want it. Earn it. Enjoy it.";
export const FILTERS = ["Locked", "Unlocked", "Purchased", "Archived"] as const;
export type FilterLabel = (typeof FILTERS)[number];

// ---- Navigation ------------------------------------------------------------

/** Open the app and wait until stored wants have loaded (empty state or list). */
export async function gotoApp(page: Page) {
  await page.goto("/");
  await waitForLoaded(page);
}

export async function waitForLoaded(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "my wants." })).toBeVisible();
  await expect(page.getByText("Loading your wants…")).toHaveCount(0);
}

export const filterGroup = (page: Page) => page.getByRole("group", { name: "Filter wants" });

/** A filter button, e.g. "Locked 2". Pass a count to require it. */
export function filterButton(page: Page, label: FilterLabel, count?: number): Locator {
  const name = count === undefined ? new RegExp(`^${label} \\d+$`) : `${label} ${count}`;
  return filterGroup(page).getByRole("button", { name, exact: true });
}

export async function showFilter(page: Page, label: FilterLabel) {
  const button = filterButton(page, label);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

export const card = (page: Page, name: string) => page.getByRole("article", { name, exact: true });

/** The detail/decide sheet (a Radix dialog named by its title). */
export const sheet = (page: Page) => page.getByRole("dialog");

export async function addExample(page: Page) {
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByRole("button", { name: `Update progress on ${DEMO}` })).toBeVisible();
}

export async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}

export async function closeSheet(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Tick every unchecked dependency in the open sheet, waiting for each to stick. */
export async function checkAllDependencies(page: Page) {
  const boxes = sheet(page).getByRole("checkbox");
  await expect(boxes).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const box = boxes.nth(i);
    if ((await box.getAttribute("aria-checked")) !== "true") await box.click();
    await expect(box).toBeChecked();
  }
}

// ---- Create form -----------------------------------------------------------

export interface NewWant {
  name: string;
  price: string;
  deps: [string, string, string];
  category?: string;
  reason?: string;
}

/** Open the create form from either the empty state or the list. */
export async function openNewWantForm(page: Page) {
  const first = page.getByRole("button", { name: "Add your first want" });
  if (await first.isVisible()) await first.click();
  else await page.getByRole("button", { name: "New want" }).click();
  const form = page.getByRole("dialog", { name: "New want" });
  await expect(form).toBeVisible();
  return form;
}

export async function fillWantForm(form: Locator, want: Partial<NewWant>) {
  if (want.name !== undefined) await form.getByLabel("What do you want?").fill(want.name);
  if (want.price !== undefined) await form.getByLabel("Price", { exact: true }).fill(want.price);
  if (want.category !== undefined) await form.getByLabel(/^Category/).fill(want.category);
  if (want.reason !== undefined) await form.getByLabel(/^Why you want it/).fill(want.reason);
  if (want.deps) {
    for (let i = 0; i < 3; i++) await form.getByLabel(`Dependency ${i + 1}`, { exact: true }).fill(want.deps[i]);
  }
}

export async function createWant(page: Page, want: NewWant) {
  const form = await openNewWantForm(page);
  await fillWantForm(form, want);
  await form.getByRole("button", { name: "Add want" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card(page, want.name)).toBeVisible();
}

// ---- Backups ---------------------------------------------------------------

interface SeedDependency {
  title: string;
  description?: string;
  completed?: boolean;
}

export interface SeedWant {
  id: string;
  name: string;
  priceCents: number;
  deps: [SeedDependency, SeedDependency, SeedDependency];
  category?: string;
  reason?: string;
  imageData?: string;
  archived?: boolean;
  purchased?: { daysAgo: number; finalPriceCents?: number };
  daysOld?: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** A record in the app's export format (see src/lib/backup.ts). */
export function backupWant(seed: SeedWant, now = Date.now()) {
  const created = new Date(now - (seed.daysOld ?? 20) * DAY).toISOString();
  const doneAt = new Date(now - 2 * DAY).toISOString();
  const want: Record<string, unknown> = {
    id: seed.id,
    name: seed.name,
    priceCents: seed.priceCents,
    currency: "CAD",
    dependencies: seed.deps.map((d, i) => ({
      id: `${seed.id}-dep-${i}`,
      title: d.title,
      ...(d.description ? { description: d.description } : {}),
      completed: Boolean(d.completed),
      ...(d.completed ? { completedAt: doneAt } : {}),
    })),
    createdAt: created,
    updatedAt: new Date(now - DAY).toISOString(),
  };
  if (seed.category) want.category = seed.category;
  if (seed.reason) want.reason = seed.reason;
  if (seed.imageData) want.imageData = seed.imageData;
  if (seed.archived) want.archivedAt = new Date(now - DAY).toISOString();
  if (seed.purchased) {
    want.purchasedAt = new Date(now - seed.purchased.daysAgo * DAY).toISOString();
    if (seed.purchased.finalPriceCents !== undefined) want.finalPriceCents = seed.purchased.finalPriceCents;
  }
  return want;
}

export function backupFile(wants: Record<string, unknown>[], name = "backup.json") {
  const json = JSON.stringify({ app: "my-wants", version: 1, exportedAt: new Date().toISOString(), wants }, null, 2);
  return { name, mimeType: "application/json", buffer: Buffer.from(json) };
}

export const importInput = (page: Page) => page.getByTestId("import-input");

/** Load wants through the real import flow (empty device: a single "Import" button). */
export async function seedWants(page: Page, seeds: SeedWant[]) {
  // With nothing stored the dialog offers a plain "Import"; otherwise Merge is the default.
  const hasWants = await filterGroup(page).isVisible();
  await importInput(page).setInputFiles(backupFile(seeds.map((s) => backupWant(s))));
  const dialog = page.getByRole("dialog", { name: `Import ${seeds.length} ${seeds.length === 1 ? "want" : "wants"}` });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: hasWants ? "Merge" : "Import", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`Imported: ${seeds.length} new, 0 updated.`)).toBeVisible();
}

/** One want in each status, plus a photo on the unlocked one. */
export function statusSeeds(photo?: string): SeedWant[] {
  return [
    {
      id: "seed-locked",
      name: "Weekend in Québec City",
      priceCents: 64000,
      category: "Travel",
      reason: "A slow weekend away, walking the old town.",
      deps: [
        { title: "Finish the spring project", completed: true },
        { title: "Save CAD 640", description: "Set aside from each paycheque, not from savings." },
        { title: "Book two days off" },
      ],
    },
    {
      id: "seed-unlocked",
      name: "Espresso grinder",
      priceCents: 32999,
      category: "Kitchen",
      imageData: photo,
      deps: [
        { title: "Use the old grinder for 3 more months", completed: true },
        { title: "Sell the drip machine", completed: true },
        { title: "Save CAD 330", completed: true },
      ],
    },
    {
      id: "seed-purchased",
      name: "Trail running shoes",
      priceCents: 18000,
      purchased: { daysAgo: 5, finalPriceCents: 15999 },
      deps: [
        { title: "Run 100 km", completed: true },
        { title: "Retire the old pair", completed: true },
        { title: "Save CAD 180", completed: true },
      ],
    },
    {
      id: "seed-archived",
      name: "Film camera",
      priceCents: 45000,
      archived: true,
      deps: [{ title: "Shoot a roll on a loaner", completed: true }, { title: "Learn to develop film" }, { title: "Save CAD 450" }],
    },
  ];
}

// ---- Images ----------------------------------------------------------------

/**
 * Draw a detailed test photo in the page (gradient, shapes, fine noise) and
 * return it as a data URL. Deterministic for a given seed.
 */
export async function drawTestImage(
  page: Page,
  { width, height, type = "image/png", quality }: { width: number; height: number; type?: string; quality?: number },
): Promise<string> {
  return page.evaluate(
    ({ width, height, type, quality }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      let seed = 42;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      const g = ctx.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, "#b6462f");
      g.addColorStop(0.5, "#e7c27d");
      g.addColorStop(1, "#2f6f8f");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 300; i++) {
        ctx.fillStyle = `hsl(${Math.floor(rnd() * 360)} 65% 50% / 0.55)`;
        ctx.beginPath();
        ctx.arc(rnd() * width, rnd() * height, 8 + rnd() * (width / 20), 0, Math.PI * 2);
        ctx.fill();
      }
      const pixels = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const n = (rnd() - 0.5) * 36;
        pixels.data[i] += n;
        pixels.data[i + 1] += n;
        pixels.data[i + 2] += n;
      }
      ctx.putImageData(pixels, 0, 0);
      return canvas.toDataURL(type, quality);
    },
    { width, height, type, quality },
  );
}

export function dataUrlToBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// ---- Timing and layout -----------------------------------------------------

/** Wait for finite CSS animations/transitions (sheet slide-ins, toasts) to finish. */
export async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => {
      const timing = a.effect?.getComputedTiming();
      return a.playState !== "running" || !timing || timing.iterations === Infinity;
    }),
  );
}

/** Today in the browser's time zone as YYYY-MM-DD, and a date some days back. */
export async function localDate(page: Page, daysAgo = 0): Promise<string> {
  return page.evaluate((daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, daysAgo);
}

/** The app's medium en-CA date format for a YYYY-MM-DD day (e.g. "Oct 16, 2026"). */
export async function displayDate(page: Page, ymd: string): Promise<string> {
  return page.evaluate((ymd) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d, 12).toLocaleDateString("en-CA", { dateStyle: "medium" });
  }, ymd);
}

/** No horizontal page scroll, and no open dialog wider than its box. */
export async function expectNoHorizontalOverflow(page: Page, screen: string) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')).map(
      (el) => ({ label: el.getAttribute("aria-labelledby") ?? el.tagName, overflow: el.scrollWidth - el.clientWidth }),
    );
    return { page: doc.scrollWidth - window.innerWidth, scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth, dialogs };
  });
  expect(result.page, `${screen}: page scrollWidth ${result.scrollWidth} > innerWidth ${result.innerWidth}`).toBeLessThanOrEqual(0);
  for (const d of result.dialogs) {
    expect(d.overflow, `${screen}: dialog ${d.label} scrolls horizontally`).toBeLessThanOrEqual(0);
  }
}

export async function expectTarget(locator: Locator, label: string, { minWidth = 0 } = {}) {
  await expect(locator, label).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label}: no bounding box`).not.toBeNull();
  expect(box!.height, `${label}: height ${box!.height}px`).toBeGreaterThanOrEqual(44);
  if (minWidth) expect(box!.width, `${label}: width ${box!.width}px`).toBeGreaterThanOrEqual(minWidth);
}

// ---- Core journey (shared by the journey and privacy tests) ------------------

/**
 * Empty state → example → 3/3 → unlock prompt → Decide → Mark purchased with a
 * past date and final price → Purchased filter → reload → still purchased.
 */
export async function purchaseJourney(page: Page) {
  await gotoApp(page);
  await expect(page.getByRole("heading", { level: 1, name: "my wants." })).toBeVisible();
  await expect(page.getByRole("heading", { name: TAGLINE })).toBeVisible();
  await expect(page.getByText("Everything stays on this device. No account, no cloud.")).toBeVisible();

  await addExample(page);
  const exampleCard = card(page, DEMO);
  await expect(exampleCard.getByText("Example", { exact: true })).toBeVisible();
  await expect(exampleCard).toContainText("$143.84");
  await expect(exampleCard).toContainText("Locked · 0 of 3");
  await expect(exampleCard.getByRole("progressbar", { name: "0 of 3 dependencies done" })).toBeVisible();
  await expect(filterButton(page, "Locked", 1)).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: `Update progress on ${DEMO}` }).click();
  const detail = page.getByRole("dialog", { name: DEMO });
  await expect(detail).toBeVisible();
  await expect(detail.getByText("3 more to unlock.")).toBeVisible();
  // A locked want offers no way to purchase it.
  await expect(detail.getByRole("button", { name: /^(Decide|Mark purchased)$/ })).toHaveCount(0);

  await checkAllDependencies(page);
  await expect(detail.getByText("3 of 3 done")).toBeVisible();
  const unlockedPanel = detail.getByRole("region", { name: "Unlocked. Time to decide." });
  await expect(unlockedPanel).toBeVisible();
  await expect(unlockedPanel.getByText("Do you still want it?")).toBeVisible();
  await expect(unlockedPanel.getByText("Can you comfortably afford it without adding unwanted debt?")).toBeVisible();
  // The moment is shown in the sheet; no toast covers it.
  await expect(page.getByText(`${DEMO} is unlocked.`, { exact: true })).toHaveCount(0);

  // Unchecking relocks an unpurchased want; checking again unlocks it.
  const second = detail.getByRole("checkbox").nth(1);
  await second.click();
  await expect(second).not.toBeChecked();
  await expect(unlockedPanel).toHaveCount(0);
  await expect(detail.getByText("1 more to unlock.")).toBeVisible();
  await second.click();
  await expect(unlockedPanel).toBeVisible();

  await unlockedPanel.getByRole("button", { name: "Decide", exact: true }).click();
  const decide = page.getByRole("dialog", { name: `${DEMO} is unlocked` });
  await expect(decide).toBeVisible();
  await expect(decide.getByRole("heading", { name: "Do you still want it?" })).toBeVisible();
  await expect(
    decide.getByRole("heading", { name: "Can you comfortably afford it without adding unwanted debt?" }),
  ).toBeVisible();

  await decide.getByRole("button", { name: "Mark purchased" }).click();
  const confirm = decide.getByRole("form", { name: "Confirm purchase" });
  await expect(confirm).toBeVisible();
  const date = confirm.getByLabel("Purchase date");
  await expect(date).toHaveValue(await localDate(page));

  // Future dates are refused.
  await date.fill(await localDate(page, -2));
  await confirm.getByRole("button", { name: "Confirm purchase" }).click();
  await expect(confirm.getByText("The purchase date can't be in the future.")).toBeVisible();
  await expect(date).toBeFocused();

  const purchasedOn = await localDate(page, 10);
  await date.fill(purchasedOn);
  await confirm.getByLabel(/^Final price/).fill("139.99");
  await confirm.getByRole("button", { name: "Confirm purchase" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`Marked ${DEMO} as purchased.`)).toBeVisible();

  const bought = `Bought ${await displayDate(page, purchasedOn)} · Paid $139.99`;
  await expect(filterButton(page, "Purchased", 1)).toBeVisible();
  await expect(filterButton(page, "Locked", 0)).toBeVisible();
  await expect(filterButton(page, "Unlocked", 0)).toBeVisible();
  // (Which filter is selected right after confirming is covered separately in app.spec.ts.)
  await showFilter(page, "Purchased");
  await expect(card(page, DEMO)).toContainText("Purchased");
  await expect(card(page, DEMO)).toContainText(bought);
  await expect(page.getByRole("button", { name: `View ${DEMO}` })).toBeVisible();

  await page.reload();
  await waitForLoaded(page);
  await expect(filterButton(page, "Purchased", 1)).toBeVisible();
  await showFilter(page, "Purchased");
  await expect(card(page, DEMO)).toContainText(bought);
  await page.getByRole("button", { name: `View ${DEMO}` }).click();
  await expect(sheet(page)).toContainText("Paid $139.99");
  await expect(sheet(page)).toContainText("Listed $143.84");
  await closeSheet(page);
}

// ---- Screen tour (shared by the axe and layout specs) ------------------------

export type ScreenVisitor = (screen: string) => Promise<void>;

/**
 * Walk through every screen of the app, calling `visit` once each screen has
 * settled: empty state, each filter, menu, detail sheets (locked, unlocked,
 * purchased, archived), delete confirmation, decide + confirm, create/edit
 * forms (incl. validation errors), import dialog and About.
 */
export async function tourScreens(page: Page, visit: ScreenVisitor) {
  const at = async (screen: string) => {
    await settle(page);
    await visit(screen);
  };

  await gotoApp(page);
  await expect(page.getByRole("button", { name: "Try an example" })).toBeVisible();
  await at("empty state");

  const photo = await drawTestImage(page, { width: 400, height: 300, type: "image/jpeg", quality: 0.7 });
  await seedWants(page, statusSeeds(photo));
  await at("toast");
  // Let the toast leave so later list screens are stable.
  await expect(page.getByText(/^Imported:/)).toHaveCount(0, { timeout: 15_000 });

  for (const f of FILTERS) {
    await showFilter(page, f);
    await expect(page.getByRole("list", { name: `${f} wants` })).toBeVisible();
    await at(`list: ${f}`);
  }

  await openMenu(page);
  await at("menu");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Locked detail + delete confirmation.
  await showFilter(page, "Locked");
  await page.getByRole("button", { name: "Update progress on Weekend in Québec City" }).click();
  await expect(sheet(page).getByText("2 more to unlock.")).toBeVisible();
  await at("detail: locked");
  await sheet(page).getByRole("button", { name: "Delete", exact: true }).click();
  const confirmDelete = page.getByRole("alertdialog");
  await expect(confirmDelete).toBeVisible();
  await at("delete confirmation");
  await confirmDelete.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmDelete).toHaveCount(0);
  await closeSheet(page);

  // Unlocked detail (card overlay), then the decide view and its confirm step.
  await showFilter(page, "Unlocked");
  await page.getByRole("button", { name: "View details for Espresso grinder" }).click();
  await expect(sheet(page).getByRole("heading", { name: "Unlocked. Time to decide." })).toBeVisible();
  await at("detail: unlocked");
  await sheet(page).getByRole("button", { name: "Decide", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Espresso grinder is unlocked" })).toBeVisible();
  await at("decide");
  await sheet(page).getByRole("button", { name: "Mark purchased" }).click();
  await expect(sheet(page).getByRole("heading", { name: "Confirm purchase" })).toBeVisible();
  await at("decide: confirm");
  await closeSheet(page);

  // Purchased detail and its edit form (with purchase details).
  await showFilter(page, "Purchased");
  await page.getByRole("button", { name: "View Trail running shoes" }).click();
  await expect(sheet(page).getByText(/^Purchased .* for \$159\.99\.$/)).toBeVisible();
  await at("detail: purchased");
  await sheet(page).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog", { name: "Edit want" })).toBeVisible();
  await at("form: edit purchased");
  await closeSheet(page);

  // Archived detail.
  await showFilter(page, "Archived");
  await page.getByRole("button", { name: "View details for Film camera" }).click();
  await expect(sheet(page).getByText(/^Archived .*\.$/)).toBeVisible();
  await at("detail: archived");
  await closeSheet(page);

  // Create form, then the same form showing validation errors.
  const form = await openNewWantForm(page);
  await at("form: new");
  await form.getByRole("button", { name: "Add want" }).click();
  await expect(form.getByText("Give your want a name.")).toBeVisible();
  await at("form: errors");
  await closeSheet(page);

  // Import dialog with merge/replace choices.
  await importInput(page).setInputFiles(
    backupFile([
      backupWant({
        id: "seed-import",
        name: "Noise-cancelling headphones",
        priceCents: 39999,
        deps: [{ title: "Commute by bike for a month" }, { title: "Save CAD 400" }, { title: "Sell old earbuds" }],
      }),
    ]),
  );
  const importDialog = page.getByRole("dialog", { name: "Import 1 want" });
  await expect(importDialog.getByRole("radiogroup", { name: "How to import" })).toBeVisible();
  await at("import dialog");
  await importDialog.getByText("Replace", { exact: true }).click();
  await expect(importDialog.getByRole("button", { name: "Replace everything" })).toBeVisible();
  await at("import dialog: replace");
  await importDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // About.
  await openMenu(page);
  await page.getByRole("menuitem", { name: "About my wants." }).click();
  const about = page.getByRole("dialog", { name: "About my wants." });
  await expect(about).toBeVisible();
  await at("about");
  await about.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
