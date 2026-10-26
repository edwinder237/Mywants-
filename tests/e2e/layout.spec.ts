// Layout at 375px / 430px / desktop: no sideways scrolling, and touch targets ≥ 44px.
import { expect, test } from "@playwright/test";

import {
  addExample,
  card,
  checkAllDependencies,
  expectNoHorizontalOverflow,
  expectTarget,
  filterButton,
  FILTERS,
  gotoApp,
  seedWants,
  settle,
  sheet,
  showFilter,
  statusSeeds,
  tourScreens,
} from "./helpers";

test("no horizontal overflow on any screen", async ({ page }) => {
  test.slow();
  const screens: string[] = [];
  await tourScreens(page, async (screen) => {
    screens.push(screen);
    await expectNoHorizontalOverflow(page, screen);
  });
  expect(screens.length).toBeGreaterThanOrEqual(18);
});

test("no horizontal overflow with long names and text", async ({ page }) => {
  await gotoApp(page);
  const long = "Supercalifragilisticexpialidocious-extra-long-unbroken-want-name-that-keeps-going";
  await seedWants(page, [
    {
      id: "long-1",
      name: long,
      priceCents: 9_999_999_999,
      category: "Category-name-without-any-spaces-40ch",
      reason: "https://example.com/" + "a".repeat(200),
      deps: [
        { title: "Dependency-with-an-extremely-long-unbroken-title-that-should-wrap-somewhere-sensible", completed: true },
        { title: "Two", description: "b".repeat(300) },
        { title: "Three" },
      ],
    },
  ]);
  await expect(card(page, long)).toBeVisible();
  await settle(page);
  await expectNoHorizontalOverflow(page, "list with long text");
  await page.getByRole("button", { name: `Update progress on ${long}` }).click();
  await expect(sheet(page)).toBeVisible();
  await settle(page);
  await expectNoHorizontalOverflow(page, "detail with long text");
});

test("touch targets are at least 44px: card actions, filters, decide/confirm, menu, New want", async ({ page }) => {
  await gotoApp(page);
  await expectTarget(page.getByRole("button", { name: "Add your first want" }), "Add your first want");
  await expectTarget(page.getByRole("button", { name: "Try an example" }), "Try an example");
  await expectTarget(page.getByRole("button", { name: "Menu" }), "Menu trigger", { minWidth: 44 });

  await seedWants(page, statusSeeds());
  await settle(page);
  await expectTarget(page.getByRole("button", { name: "Menu" }), "Menu trigger", { minWidth: 44 });
  await expectTarget(page.getByRole("button", { name: "New want" }), "New want", { minWidth: 44 });

  const primary = {
    Locked: "Update progress on Weekend in Québec City",
    Unlocked: "Decide on Espresso grinder",
    Purchased: "View Trail running shoes",
    Archived: "Restore Film camera",
  } as const;
  for (const f of FILTERS) {
    await expectTarget(filterButton(page, f), `${f} filter`, { minWidth: 44 });
    await showFilter(page, f);
    await settle(page);
    await expectTarget(page.getByRole("button", { name: primary[f] }), `card action: ${primary[f]}`, { minWidth: 44 });
  }

  // Detail sheet: close button and each dependency row.
  await showFilter(page, "Locked");
  await page.getByRole("button", { name: primary.Locked }).click();
  await settle(page);
  await expectTarget(sheet(page).getByRole("button", { name: "Close" }), "sheet Close", { minWidth: 44 });
  const rows = sheet(page).locator("label").filter({ has: page.getByRole("checkbox") });
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expectTarget(rows.nth(i), `dependency row ${i + 1}`);
  for (const name of ["Edit", "Archive", "Delete"]) {
    await expectTarget(sheet(page).getByRole("button", { name, exact: true }), `sheet ${name}`);
  }
  await page.keyboard.press("Escape");

  // Decide flow.
  await showFilter(page, "Unlocked");
  await page.getByRole("button", { name: "View details for Espresso grinder" }).click();
  await settle(page);
  await expectTarget(sheet(page).getByRole("button", { name: "Decide", exact: true }), "Decide");
  await sheet(page).getByRole("button", { name: "Decide", exact: true }).click();
  await settle(page);
  for (const name of ["Back to details", "Mark purchased", "Not now", "Archive instead"]) {
    await expectTarget(sheet(page).getByRole("button", { name }), name);
  }
  await sheet(page).getByRole("button", { name: "Mark purchased" }).click();
  await settle(page);
  const confirm = sheet(page).getByRole("form", { name: "Confirm purchase" });
  await expectTarget(confirm.getByRole("button", { name: "Confirm purchase" }), "Confirm purchase");
  await expectTarget(confirm.getByRole("button", { name: "Cancel" }), "Cancel (confirm step)");
  await expectTarget(confirm.getByLabel("Purchase date"), "Purchase date input");
  await expectTarget(confirm.getByLabel(/^Final price/), "Final price input");
});

test("unlock moment keeps the decision prompt on screen at phone sizes", async ({ page }) => {
  await gotoApp(page);
  await addExample(page);
  await page.getByRole("button", { name: /^Update progress on / }).click();
  await checkAllDependencies(page);
  const panel = sheet(page).getByRole("region", { name: "Unlocked. Time to decide." });
  await expect(panel).toBeVisible();
  await settle(page);
  await expect(panel.getByRole("heading", { name: "Unlocked. Time to decide." })).toBeInViewport();
  await expectNoHorizontalOverflow(page, "unlock moment");
});
