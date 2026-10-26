import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function addSample(page: Page) {
  await page.getByRole("button", { name: /try a sample want/i }).click();
  await expect(page.getByRole("button", { name: /lagavulin 16/i })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("empty state, sample, unlock, purchase, and persistence", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "My Wants" })).toBeVisible();
  await expect(page.getByText("Earn the things you want")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await addSample(page);
  await expect(page.getByText("Sample", { exact: true })).toBeVisible();
  await expect(page.getByText("$143.84")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: /lagavulin 16/i }).click();
  const sheet = page.getByRole("dialog");
  const boxes = sheet.getByRole("checkbox");
  await expect(boxes).toHaveCount(3);
  await expect(sheet.getByRole("button", { name: /mark as purchased/i })).toHaveCount(0);

  for (let i = 0; i < 3; i++) await boxes.nth(i).click();
  await expect(sheet.getByText("Unlocked.")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Unchecking re-locks.
  await boxes.nth(1).click();
  await expect(sheet.getByRole("button", { name: /mark as purchased/i })).toHaveCount(0);
  await boxes.nth(1).click();

  await sheet.getByRole("button", { name: /mark as purchased/i }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("doesn't mean this fits your budget");
  await confirm.getByRole("button", { name: /^mark purchased$/i }).click();
  // Wait for the saved result, not just closed dialogs: the open alert hides
  // the sheet from the accessibility tree, so "no dialog" is true too early.
  await expect(page.getByRole("tab", { name: "Purchased 1" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.reload();
  await page.getByRole("tab", { name: /purchased/i }).click();
  await expect(page.getByRole("button", { name: /lagavulin 16/i })).toContainText("Bought");
});

test("touch targets are at least 44px", async ({ page }) => {
  await addSample(page);
  const targets = [
    page.getByRole("button", { name: "Menu" }),
    page.getByRole("button", { name: /new want/i }),
    ...(await page.getByRole("tab").all()),
  ];
  for (const t of targets) {
    const box = await t.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: /lagavulin 16/i }).click();
  const row = page.getByRole("dialog").locator("label").first();
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("create form fits and validates on small screens", async ({ page }) => {
  await page.getByRole("button", { name: /add your first want/i }).click();
  const sheet = page.getByRole("dialog");
  await expectNoHorizontalScroll(page);
  await sheet.getByLabel("What do you want?").fill("Rain jacket");
  await sheet.getByLabel("Price").fill("220");
  await sheet.getByLabel("Dependency 1").fill("Walk 50k steps");
  await sheet.getByRole("button", { name: /add want/i }).click();
  await expect(sheet.getByRole("alert")).toContainText("Fill in all three dependencies");
  await sheet.getByLabel("Dependency 2").fill("Clear the inbox");
  await sheet.getByLabel("Dependency 3").fill("Fix the bike");
  await sheet.getByRole("button", { name: /add want/i }).click();
  await expect(page.getByRole("button", { name: /rain jacket/i })).toContainText("$220.00");
});

test("export then import round-trips; bad files are rejected", async ({ page }, testInfo) => {
  await addSample(page);
  await page.getByRole("button", { name: "Menu" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /export/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^my-wants-\d{4}-\d{2}-\d{2}\.json$/);
  const exportPath = testInfo.outputPath("export.json");
  await download.saveAs(exportPath);

  const input = page.getByTestId("import-input");

  // Invalid file: nothing changes.
  await input.setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{oops") });
  await expect(page.getByText("This file isn't valid JSON.")).toBeVisible();
  await expect(page.getByRole("button", { name: /lagavulin 16/i })).toHaveCount(1);

  // Delete the sample, then restore it from the export.
  await page.getByRole("button", { name: /lagavulin 16/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Earn the things you want")).toBeVisible();

  await input.setInputFiles(exportPath);
  await page.getByRole("alertdialog").getByRole("button", { name: "Replace" }).click();
  await expect(page.getByRole("button", { name: /lagavulin 16/i })).toBeVisible();
});

test("works offline after the first load", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Service worker offline check runs in Chromium");
  await addSample(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload once so the page is controlled by the service worker.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "My Wants" })).toBeVisible();
  await expect(page.getByRole("button", { name: /lagavulin 16/i })).toBeVisible();
  await context.setOffline(false);
});
