// Renders public/icon.svg to the PNG sizes the manifest and iOS need.
// Run once after changing the icon: `node scripts/generate-icons.mjs`.
// Uses the Playwright Chromium installed for e2e tests.
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const svg = await readFile(new URL("../public/icon.svg", import.meta.url), "utf8");
// Square, full-bleed variant for iOS and maskable icons (the OS applies the mask).
const square = svg.replace(/rx="112"/, 'rx="0"');

const targets = [
  { file: "icon-192.png", size: 192, svg },
  { file: "icon-512.png", size: 512, svg },
  { file: "apple-touch-icon.png", size: 180, svg: square },
  // Maskable: keep artwork inside the central 80% safe zone.
  { file: "icon-maskable-512.png", size: 512, svg: square, scale: 0.8 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const inner = t.scale ? t.size * t.scale : t.size;
  const bleed = t.svg === square;
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:${bleed ? "#2b2622" : "transparent"};display:grid;place-items:center;height:100vh">
      <div style="width:${inner}px;height:${inner}px">${t.svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div>
    </body></html>`,
  );
  await page.screenshot({ path: new URL(`../public/${t.file}`, import.meta.url).pathname, omitBackground: !bleed });
  console.log("wrote", t.file);
}
await browser.close();
