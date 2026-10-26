// Core user journeys against the production static export (./out).
// PWA/offline/persistence/privacy: pwa.spec.ts. Axe: a11y.spec.ts. Layout: layout.spec.ts.
import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import {
  addExample,
  backupFile,
  backupWant,
  card,
  checkAllDependencies,
  closeSheet,
  createWant,
  dataUrlToBuffer,
  DEMO,
  drawTestImage,
  expectNoHorizontalOverflow,
  fillWantForm,
  filterButton,
  gotoApp,
  importInput,
  localDate,
  openMenu,
  openNewWantForm,
  pngSize,
  purchaseJourney,
  sheet,
  showFilter,
  waitForLoaded,
} from "./helpers";

const RAIN_JACKET = {
  name: "Rain jacket",
  price: "220",
  deps: ["Walk 50 km this month", "Clear the inbox", "Fix the bike"],
} as const satisfies Parameters<typeof createWant>[1];

async function exportBackup(page: Page, outputPath: (...segments: string[]) => string) {
  const menu = await openMenu(page);
  const downloadPromise = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "Export backup (JSON)" }).click();
  const download = await downloadPromise;
  // One folder per export keeps the file's real name (the import dialog shows it).
  const path = outputPath(`export-${Date.now()}`, download.suggestedFilename());
  await download.saveAs(path);
  const buffer = await readFile(path);
  // Re-upload as a buffer: Chromium ignores local paths with non-ASCII characters
  // (test titles put "→" into the output folder name).
  const file = { name: download.suggestedFilename(), mimeType: "application/json", buffer };
  return { download, file, json: JSON.parse(buffer.toString("utf8")) };
}

async function deleteWant(page: Page, name: string, openWith: string) {
  await page.getByRole("button", { name: openWith }).click();
  await sheet(page).getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: `Delete “${name}”?` });
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`Deleted ${name}.`)).toBeVisible();
  await expect(card(page, name)).toHaveCount(0);
}

test("journey: example → 3/3 unlock → decide → purchase with date and price → persists after reload", async ({
  page,
}) => {
  await purchaseJourney(page);
});

for (const { action, button, filter, cardAction } of [
  { action: "Confirm purchase", button: "Confirm purchase", filter: "Purchased", cardAction: `View ${DEMO}` },
  { action: "Archive instead", button: "Archive instead", filter: "Archived", cardAction: `Restore ${DEMO}` },
] as const) {
  test(`decide → ${action}: the list follows the want to ${filter} and focus returns to its card`, async ({ page }) => {
    // Regression: this used to close onto the (now empty) Unlocked filter.
    await gotoApp(page);
    await addExample(page);
    await page.getByRole("button", { name: `Update progress on ${DEMO}` }).click();
    await checkAllDependencies(page);
    await sheet(page).getByRole("button", { name: "Decide", exact: true }).click();
    if (action === "Confirm purchase") await sheet(page).getByRole("button", { name: "Mark purchased" }).click();
    await sheet(page).getByRole("button", { name: button }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await expect(filterButton(page, filter, 1)).toHaveAttribute("aria-pressed", "true", { timeout: 2_000 });
    await expect(page.getByRole("button", { name: cardAction })).toBeFocused({ timeout: 2_000 });
  });
}

test("create a want with a photo; a blank third dependency blocks saving", async ({ page }) => {
  await gotoApp(page);
  const form = await openNewWantForm(page);

  // A 1600×1200 PNG, generated in the page, well over the 300 KB storage target.
  const png = dataUrlToBuffer(await drawTestImage(page, { width: 1600, height: 1200 }));
  expect(pngSize(png)).toEqual({ width: 1600, height: 1200 });
  expect(png.length).toBeGreaterThan(300_000);

  await form.locator('input[type="file"]').setInputFiles({ name: "jacket.png", mimeType: "image/png", buffer: png });
  await expect(form.getByRole("img", { name: "Selected photo" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Change photo" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Remove photo" })).toBeVisible();

  await fillWantForm(form, {
    name: RAIN_JACKET.name,
    price: RAIN_JACKET.price,
    category: "Outdoors",
    reason: "Stay dry on the walk to work.",
    deps: [RAIN_JACKET.deps[0], RAIN_JACKET.deps[1], "   "],
  });
  await form.getByRole("button", { name: "Add want" }).click();

  // Whitespace isn't a title: the form stays open and points at the field.
  const third = form.getByLabel("Dependency 3", { exact: true });
  await expect(form.getByText("Add a title for dependency 3.")).toBeVisible();
  await expect(third).toHaveAttribute("aria-invalid", "true");
  await expect(third).toBeFocused();
  await expect(page.getByRole("dialog", { name: "New want" })).toBeVisible();
  await expectNoHorizontalOverflow(page, "form with an error");

  await third.fill(RAIN_JACKET.deps[2]);
  await expect(form.getByText("Add a title for dependency 3.")).toHaveCount(0);
  await form.getByRole("button", { name: "Add want" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const saved = card(page, RAIN_JACKET.name);
  await expect(saved).toContainText("$220.00");
  await expect(saved).toContainText("Locked · 0 of 3");
  await expect(saved).toContainText(`Next: ${RAIN_JACKET.deps[0]}`);
  await expect(filterButton(page, "Locked", 1)).toBeVisible();

  const checkThumb = async () => {
    const img = card(page, RAIN_JACKET.name).locator("img");
    await expect(img).toHaveCount(1);
    const src = (await img.getAttribute("src")) ?? "";
    expect(src).toMatch(/^data:image\/jpeg;base64,/);
    const bytes = dataUrlToBuffer(src).length;
    expect(bytes).toBeGreaterThan(1_000);
    expect(bytes).toBeLessThanOrEqual(300_000);
    const [w, h] = await img.evaluate(async (el: HTMLImageElement) => {
      await el.decode();
      return [el.naturalWidth, el.naturalHeight];
    });
    // Downscaled to at most 1024 px on the long edge, aspect ratio kept.
    expect(Math.max(w, h)).toBeLessThanOrEqual(1024);
    expect(Math.abs(w / h - 4 / 3)).toBeLessThan(0.01);
    return src;
  };
  const src = await checkThumb();

  await page.reload();
  await waitForLoaded(page);
  expect(await checkThumb()).toBe(src);

  await page.getByRole("button", { name: `Update progress on ${RAIN_JACKET.name}` }).click();
  await expect(sheet(page).locator("img")).toHaveAttribute("src", src);
  await expect(sheet(page)).toContainText("Outdoors");
  await expect(sheet(page)).toContainText("Stay dry on the walk to work.");
});

test("archive → Archived filter → restore; delete asks for confirmation", async ({ page }) => {
  await gotoApp(page);
  await addExample(page);

  await page.getByRole("button", { name: `Update progress on ${DEMO}` }).click();
  await sheet(page).getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByText(`Archived ${DEMO}.`)).toBeVisible();
  // The sheet stays open on the archived want, offering Restore.
  await expect(sheet(page).getByRole("button", { name: "Restore" })).toBeVisible();
  await closeSheet(page);

  // Closing follows the want to its new filter.
  await expect(filterButton(page, "Archived", 1)).toHaveAttribute("aria-pressed", "true");
  await expect(filterButton(page, "Locked", 0)).toBeVisible();
  await expect(card(page, DEMO)).toContainText("Archived");

  await page.reload();
  await waitForLoaded(page);
  await showFilter(page, "Archived");
  await page.getByRole("button", { name: `Restore ${DEMO}` }).click();
  await expect(page.getByText(`Restored ${DEMO}.`)).toBeVisible();
  await expect(page.getByText("Nothing archived. Archive a want to set it aside without deleting it.")).toBeVisible();
  await expect(filterButton(page, "Archived", 0)).toBeVisible();
  await showFilter(page, "Locked");
  await expect(card(page, DEMO)).toContainText("Locked · 0 of 3");

  // Delete: cancelling keeps it.
  await page.getByRole("button", { name: `Update progress on ${DEMO}` }).click();
  await sheet(page).getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: `Delete “${DEMO}”?` });
  await expect(confirm).toContainText("can't be undone");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: DEMO })).toBeVisible();

  await sheet(page).getByRole("button", { name: "Delete", exact: true }).click();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`Deleted ${DEMO}.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try an example" })).toBeVisible();

  await page.reload();
  await waitForLoaded(page);
  await expect(page.getByRole("button", { name: "Try an example" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("export → delete → import with Merge; bad files change nothing; Replace replaces", async ({
  page,
}, testInfo) => {
  const outputPath = (...segments: string[]) => testInfo.outputPath(...segments);
  await gotoApp(page);
  await addExample(page);
  await createWant(page, RAIN_JACKET);
  await expect(filterButton(page, "Locked", 2)).toBeVisible();

  // Export downloads my-wants-YYYY-MM-DD.json with every want.
  const first = await exportBackup(page, outputPath);
  const fileName = `my-wants-${await localDate(page)}.json`;
  expect(first.download.suggestedFilename()).toBe(fileName);
  await expect(page.getByText("Exported 2 wants.")).toBeVisible();
  expect(first.json).toMatchObject({ app: "my-wants", version: 1 });
  expect(first.json.wants.map((w: { name: string }) => w.name).sort()).toEqual([DEMO, RAIN_JACKET.name]);

  await deleteWant(page, DEMO, `Update progress on ${DEMO}`);
  await expect(filterButton(page, "Locked", 1)).toBeVisible();

  // Malformed or unrelated files are rejected with a message; nothing changes.
  const input = importInput(page);
  const rejects: [string, string | RegExp][] = [
    ["{oops", "This file isn't valid JSON."],
    [JSON.stringify({ hello: "world" }), "This file isn't a My Wants export."],
  ];
  const twoDeps = structuredClone(first.json);
  twoDeps.wants[0].dependencies.pop();
  rejects.push([
    JSON.stringify(twoDeps),
    /^Import failed\. Want 1 \(".+"\) must have exactly three dependencies\. Nothing on this device was changed\.$/,
  ]);
  for (const [i, [body, message]] of rejects.entries()) {
    await input.setInputFiles({ name: `bad-${i}.json`, mimeType: "application/json", buffer: Buffer.from(body) });
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await expect(filterButton(page, "Locked", 1)).toBeVisible();
  await expect(card(page, RAIN_JACKET.name)).toBeVisible();
  await page.reload();
  await waitForLoaded(page);
  await expect(filterButton(page, "Locked", 1)).toBeVisible();
  await expect(card(page, RAIN_JACKET.name)).toBeVisible();

  // Import the export and choose Merge.
  await input.setInputFiles(first.file);
  const mergeDialog = page.getByRole("dialog", { name: "Import 2 wants" });
  await expect(mergeDialog).toContainText(`From ${fileName}.`);
  const choices = mergeDialog.getByRole("radiogroup", { name: "How to import" });
  await expect(choices.getByRole("radio", { name: "Merge" })).toBeChecked();
  await expect(choices).toContainText("1 new · 0 updated · 1 unchanged");
  await choices.getByText("Replace", { exact: true }).click();
  await expect(mergeDialog.getByRole("button", { name: "Replace everything" })).toBeVisible();
  await choices.getByText("Merge", { exact: true }).click();
  await expect(choices.getByRole("radio", { name: "Merge" })).toBeChecked();
  await mergeDialog.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Imported: 1 new, 0 updated.")).toBeVisible();
  await expect(filterButton(page, "Locked", 2)).toBeVisible();
  await expect(card(page, DEMO)).toBeVisible();
  await expect(card(page, DEMO).getByText("Example", { exact: true })).toBeVisible();

  // Round trip: a fresh export holds exactly what was exported before.
  const second = await exportBackup(page, outputPath);
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  expect([...second.json.wants].sort(byId)).toEqual([...first.json.wants].sort(byId));

  // Replace swaps everything on the device for the file's contents.
  const replacement = backupWant({
    id: "replacement-1",
    name: "Noise-cancelling headphones",
    priceCents: 39999,
    deps: [{ title: "Commute by bike for a month", completed: true }, { title: "Save CAD 400" }, { title: "Sell old earbuds" }],
  });
  await input.setInputFiles(backupFile([replacement], "replacement.json"));
  const replaceDialog = page.getByRole("dialog", { name: "Import 1 want" });
  await replaceDialog.getByRole("radiogroup").getByText("Replace", { exact: true }).click();
  await expect(replaceDialog.getByRole("radio", { name: "Replace" })).toBeChecked();
  await expect(replaceDialog).toContainText("Deletes the 2 wants on this device");
  await replaceDialog.getByRole("button", { name: "Replace everything" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Replaced with 1 want.")).toBeVisible();

  const onlyReplacement = async () => {
    await expect(filterButton(page, "Locked", 1)).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(card(page, "Noise-cancelling headphones")).toContainText("Locked · 1 of 3");
  };
  await onlyReplacement();
  await page.reload();
  await waitForLoaded(page);
  await onlyReplacement();
});

test("keyboard: Tab to a card's action, Enter opens the sheet, Escape closes it and returns focus", async ({
  page,
}) => {
  await gotoApp(page);
  await addExample(page);
  // Start from a fresh page so focus begins at the document, not where the app put it.
  await page.reload();
  await waitForLoaded(page);

  const action = page.getByRole("button", { name: `Update progress on ${DEMO}` });
  await expect(action).toBeVisible();
  for (let i = 0; i < 20 && !(await action.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(action).toBeFocused();

  await page.keyboard.press("Enter");
  const detail = page.getByRole("dialog", { name: DEMO });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("heading", { name: DEMO, exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(action).toBeFocused();
});

test("keyboard: unlock with Space, then focus follows the want to its Decide action", async ({ page }) => {
  await gotoApp(page);
  await addExample(page);
  const action = page.getByRole("button", { name: `Update progress on ${DEMO}` });
  await action.focus();
  await page.keyboard.press("Enter");
  const detail = page.getByRole("dialog", { name: DEMO });
  await expect(detail).toBeVisible();

  const boxes = detail.getByRole("checkbox");
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Tab");
    await expect(boxes.nth(i)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(boxes.nth(i)).toBeChecked();
  }
  // The unlock moment moves focus to the decision prompt.
  await expect(detail.getByRole("heading", { name: "Unlocked. Time to decide." })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(filterButton(page, "Unlocked", 1)).toHaveAttribute("aria-pressed", "true");
  const decide = page.getByRole("button", { name: `Decide on ${DEMO}` });
  await expect(decide).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: `${DEMO} is unlocked` })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(decide).toBeFocused();
});

test("theme: Menu → Theme → Dark sets data-theme and survives reload; Light and System work", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await gotoApp(page);
  const html = page.locator("html");
  const scheme = () => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  await expect(html).not.toHaveAttribute("data-theme");
  expect(await scheme()).toBe("light");

  let menu = await openMenu(page);
  await expect(menu.getByRole("menuitemradio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(await scheme()).toBe("dark");
  // Browser chrome follows the forced theme.
  await expect(page.locator('meta[name="theme-color"][media="all"]')).toHaveAttribute("content", "#1b1815");

  await page.reload();
  await waitForLoaded(page);
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(await scheme()).toBe("dark");
  menu = await openMenu(page);
  await expect(menu.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

  // Light wins over a dark system setting, and also persists.
  await page.emulateMedia({ colorScheme: "dark" });
  await menu.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  expect(await scheme()).toBe("light");
  await page.reload();
  await waitForLoaded(page);
  await expect(html).toHaveAttribute("data-theme", "light");
  expect(await scheme()).toBe("light");

  // System follows the OS again.
  menu = await openMenu(page);
  await menu.getByRole("menuitemradio", { name: "System" }).click();
  await expect(html).not.toHaveAttribute("data-theme");
  expect(await scheme()).toBe("dark");
  await page.reload();
  await waitForLoaded(page);
  await expect(html).not.toHaveAttribute("data-theme");
});
