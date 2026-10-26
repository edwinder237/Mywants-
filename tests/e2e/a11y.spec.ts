// Automated WCAG 2.1 A/AA checks (axe-core) on every screen, in light and dark.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { addExample, gotoApp, openMenu, settle, tourScreens } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Accepted exception: while the Radix dropdown menu is open it sets aria-hidden
 * on the app root. axe flags the root's buttons as focusable, but the modal menu
 * traps focus and blocks pointer input, so they can't be reached. A non-modal
 * menu would let a tap outside also activate the card underneath.
 */
const KNOWN = [
  {
    rule: "aria-hidden-focus",
    matches: (screen: string, html: string) => screen === "menu" && html.includes("min-h-dvh"),
  },
];

type Finding = { rule: string; screen: string; text: string; known: boolean };

async function axe(page: Page, screen: string, build = (b: AxeBuilder) => b.withTags(TAGS)): Promise<Finding[]> {
  const { violations } = await build(new AxeBuilder({ page })).analyze();
  return violations.flatMap((v) =>
    v.nodes.map((node) => ({
      rule: v.id,
      screen,
      known: KNOWN.some((k) => k.rule === v.id && k.matches(screen, node.html)),
      text:
        `[${screen}] ${v.id} (${v.impact}): ${v.help}\n    at ${node.target.join(" ")}\n    ${node.html}\n    ` +
        (node.failureSummary ?? "").replace(/\n/g, "\n    "),
    })),
  );
}

const report = (findings: Finding[]) => findings.map((f) => f.text).join("\n\n");

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe: no WCAG 2.1 A/AA violations on any screen (${colorScheme})`, async ({ page }) => {
    test.slow();
    await page.emulateMedia({ colorScheme });
    const findings: Finding[] = [];
    const screens: string[] = [];
    await tourScreens(page, async (screen) => {
      screens.push(screen);
      findings.push(...(await axe(page, screen)));
    });
    // The tour must actually have covered every screen the spec lists.
    expect(screens).toEqual(
      expect.arrayContaining([
        "empty state",
        "list: Locked",
        "list: Unlocked",
        "list: Purchased",
        "list: Archived",
        "detail: locked",
        "detail: unlocked",
        "decide",
        "decide: confirm",
        "form: new",
        "import dialog",
        "about",
      ]),
    );
    const unknown = findings.filter((f) => !f.known);
    expect(unknown, report(unknown)).toEqual([]);
  });
}

test("axe: forced Dark theme (Menu → Theme → Dark on a light system) on lists and detail sheets", async ({ page }) => {
  // data-theme="dark" is a separate CSS block from the prefers-color-scheme one.
  test.slow();
  await page.emulateMedia({ colorScheme: "light" });
  const findings: Finding[] = [];
  let forced = false;
  await tourScreens(page, async (screen) => {
    if (screen === "list: Locked" && !forced) {
      const menu = await openMenu(page);
      await menu.getByRole("menuitemradio", { name: "Dark" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await settle(page);
      forced = true;
    }
    if (forced && (screen.startsWith("list:") || screen.startsWith("detail:") || screen.startsWith("decide"))) {
      findings.push(...(await axe(page, `${screen} (forced dark)`)));
    }
  });
  expect(forced).toBe(true);
  const unknown = findings.filter((f) => !f.known);
  expect(unknown, report(unknown)).toEqual([]);
});

// ---- Regressions -------------------------------------------------------------

test("axe: filter buttons include their visible text in their accessible name (WCAG 2.5.3)", async ({ page }) => {
  await gotoApp(page);
  await addExample(page);
  await settle(page);
  const findings = await axe(page, "filters", (b) =>
    b.include('[aria-label="Filter wants"]').withRules(["label-content-name-mismatch"]),
  );
  expect(findings, report(findings)).toEqual([]);
});

test("the open menu traps focus, so content under its aria-hidden root is unreachable", async ({ page }) => {
  // Backs the accepted aria-hidden-focus exception above.
  await gotoApp(page);
  await addExample(page);
  await openMenu(page);
  await settle(page);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const inMenu = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="menu"]')));
    expect(inMenu).toBe(true);
  }
});
