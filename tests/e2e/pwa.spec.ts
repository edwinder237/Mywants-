// Installability, offline support, durable storage and privacy.
import { chromium, expect, test, type BrowserContextOptions } from "@playwright/test";

import {
  addExample,
  card,
  checkAllDependencies,
  closeSheet,
  createWant,
  DEMO,
  drawTestImage,
  dataUrlToBuffer,
  gotoApp,
  openMenu,
  openNewWantForm,
  pngSize,
  purchaseJourney,
  waitForLoaded,
} from "./helpers";

test("offline: after the first load, reload and a brand-new tab both open with data", async ({ page, context }) => {
  await gotoApp(page);
  await addExample(page);

  // The worker installs (precaching the shell), activates and claims this page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state ?? null)).toBe("activated");

  await context.setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  const reloaded = await page.reload();
  expect(reloaded?.fromServiceWorker()).toBe(true);
  await waitForLoaded(page);
  await expect(card(page, DEMO)).toContainText("Locked · 0 of 3");

  // A cold start: a new page in the same (offline) browser profile.
  const fresh = await context.newPage();
  const response = await fresh.goto("/");
  expect(response?.fromServiceWorker()).toBe(true);
  await waitForLoaded(fresh);
  await expect(card(fresh, DEMO)).toBeVisible();
  await expect(fresh.getByRole("heading", { level: 1, name: "my wants." })).toBeVisible();

  // Changes made offline are kept too.
  await fresh.getByRole("button", { name: `Update progress on ${DEMO}` }).click();
  await fresh.getByRole("dialog").getByRole("checkbox").first().click();
  await expect(fresh.getByRole("dialog").getByRole("checkbox").first()).toBeChecked();
  await fresh.keyboard.press("Escape");
  await fresh.reload();
  await waitForLoaded(fresh);
  await expect(card(fresh, DEMO)).toContainText("Locked · 1 of 3");

  await context.setOffline(false);
});

test("browser restart: data in a persistent profile survives closing and relaunching", async ({ baseURL }, testInfo) => {
  // Runs on every project: launchPersistentContext takes the project's device
  // settings, so the iPhone viewports get a real profile on disk as well.
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  const options: BrowserContextOptions = { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch };
  const userDataDir = testInfo.outputPath("user-data");

  const first = await chromium.launchPersistentContext(userDataDir, options);
  try {
    const page = first.pages()[0] ?? (await first.newPage());
    await gotoApp(page);
    await addExample(page);
    await page.getByRole("button", { name: `Update progress on ${DEMO}` }).click();
    await page.getByRole("dialog").getByRole("checkbox").first().click();
    await expect(page.getByRole("dialog").getByRole("checkbox").first()).toBeChecked();
    await closeSheet(page);
    await expect(card(page, DEMO)).toContainText("Locked · 1 of 3");
  } finally {
    await first.close();
  }

  const second = await chromium.launchPersistentContext(userDataDir, options);
  try {
    const page = second.pages()[0] ?? (await second.newPage());
    await gotoApp(page);
    await expect(card(page, DEMO)).toContainText("Locked · 1 of 3");
    await page.getByRole("button", { name: `Update progress on ${DEMO}` }).click();
    await expect(page.getByRole("dialog").getByRole("checkbox").first()).toBeChecked();
    await expect(page.getByRole("dialog").getByRole("checkbox").nth(1)).not.toBeChecked();
  } finally {
    await second.close();
  }
});

test("PWA: manifest, icons and apple-touch-icon", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "my wants.", display: "standalone", start_url: "/" });

  type Icon = { src: string; sizes: string; type?: string; purpose?: string };
  const icons: Icon[] = manifest.icons;
  const find = (pred: (i: Icon) => boolean, what: string) => {
    const icon = icons.find(pred);
    expect(icon, `manifest icon: ${what}`).toBeTruthy();
    return icon!;
  };
  const wanted = [
    find((i) => i.sizes === "192x192" && (i.purpose ?? "any").includes("any"), "192x192"),
    find((i) => i.sizes === "512x512" && (i.purpose ?? "any").includes("any"), "512x512"),
    find((i) => (i.purpose ?? "").includes("maskable"), "maskable"),
  ];
  for (const icon of wanted) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"], icon.src).toContain("image/png");
    const [w, h] = icon.sizes.split("x").map(Number);
    expect(pngSize(await r.body()), `${icon.src} pixel size`).toEqual({ width: w, height: h });
  }

  await gotoApp(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  const apple = page.locator('link[rel="apple-touch-icon"]');
  await expect(apple).toHaveCount(1);
  const href = (await apple.getAttribute("href"))!;
  const touch = await request.get(href);
  expect(touch.status()).toBe(200);
  expect(pngSize(await touch.body())).toEqual({ width: 180, height: 180 });
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "my wants.");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /width=device-width/);
});

test("privacy: every request during a full journey is same-origin (no telemetry or third parties)", async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const seen: { url: string; type: string; from: string }[] = [];
  // Context-level events include requests made by the service worker.
  context.on("request", (r) =>
    seen.push({ url: r.url(), type: r.resourceType(), from: r.serviceWorker() ? "service worker" : "page" }),
  );
  const sockets: string[] = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));

  await purchaseJourney(page);

  // Plus a photo, an export, the About dialog and the theme switch.
  const form = await openNewWantForm(page);
  const png = dataUrlToBuffer(await drawTestImage(page, { width: 800, height: 600 }));
  await form.locator('input[type="file"]').setInputFiles({ name: "p.png", mimeType: "image/png", buffer: png });
  await expect(form.getByRole("img", { name: "Selected photo" })).toBeVisible();
  await page.keyboard.press("Escape");
  await createWant(page, { name: "Rain jacket", price: "220", deps: ["One", "Two", "Three"] });
  await page.getByRole("button", { name: "Update progress on Rain jacket" }).click();
  await checkAllDependencies(page);
  await closeSheet(page);

  let menu = await openMenu(page);
  const download = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "Export backup (JSON)" }).click();
  await download;
  menu = await openMenu(page);
  await menu.getByRole("menuitemradio", { name: "Dark" }).click();
  menu = await openMenu(page);
  await menu.getByRole("menuitem", { name: "About my wants." }).click();
  await expect(page.getByRole("dialog", { name: "About my wants." })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await waitForLoaded(page);

  // Cross-check with what the page itself loaded.
  const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name));

  const external = [...seen.map((s) => s.url), ...resources].filter((url) => {
    const { protocol } = new URL(url);
    if (protocol === "data:" || protocol === "blob:") return false; // local, never leaves the device
    return new URL(url).origin !== origin;
  });
  expect(seen.length).toBeGreaterThan(5);
  expect(external, `third-party requests:\n${external.join("\n")}`).toEqual([]);
  expect(sockets).toEqual([]);
  // No beacons or XHR/fetch traffic at all: the app is static files only.
  const apiCalls = seen.filter((s) => s.type === "xhr" || s.type === "ping" || s.type === "eventsource");
  expect(apiCalls, JSON.stringify(apiCalls, null, 2)).toEqual([]);
});
