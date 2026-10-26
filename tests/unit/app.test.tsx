// App-level integration tests: the real MyWantsApp + useWants hook over
// fake-indexeddb (tests/setup.ts), driven only through the UI.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it } from "vitest";

import { MyWantsApp } from "@/components/my-wants-app";
import { Toaster } from "@/components/ui/sonner";
import { createBackup } from "@/lib/backup";
import { wantRepository } from "@/lib/db";
import {
  completedCount,
  createDemoWant,
  createWant,
  DEMO_WANT_ID,
  getStatus,
  markPurchased,
  toggleDependency,
  type Want,
  type WantInput,
} from "@/lib/wants";

type User = ReturnType<typeof userEvent.setup>;

// jsdom gap: sonner calls setPointerCapture when a toast (e.g. its Undo button) is pressed.
Element.prototype.setPointerCapture ??= () => {};

/** The database the app-wide repository (src/lib/db.ts) opens. */
const DB_NAME = "my-wants";

function deleteDatabase(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // "blocked" only means a connection is still closing; success follows.
  });
}

// Each test starts from an empty device: drop the shared connection, then the database.
beforeEach(async () => {
  // Sonner replays still-active toasts to a newly mounted Toaster; start clean.
  toast.dismiss();
  await wantRepository.close();
  await deleteDatabase(DB_NAME);
});

function renderApp() {
  const user = userEvent.setup();
  const view = render(
    <>
      <MyWantsApp />
      <Toaster />
    </>,
  );
  return { user, ...view };
}

/** What is actually in IndexedDB right now. */
async function stored(): Promise<Want[]> {
  return (await wantRepository.list()).wants;
}

const fmt = (d: Date) => d.toLocaleDateString("en-CA", { dateStyle: "medium" });

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function filterButton(label: "Locked" | "Unlocked" | "Purchased" | "Archived") {
  const group = screen.getByRole("group", { name: "Filter wants" });
  return within(group).getByRole("button", { name: new RegExp(`^${label} \\d+$`) });
}

/** Asserts every filter's count, e.g. { Locked: 1, Unlocked: 0, … }. */
function expectCounts(counts: { Locked: number; Unlocked: number; Purchased: number; Archived: number }) {
  for (const [label, count] of Object.entries(counts)) {
    expect(filterButton(label as keyof typeof counts)).toHaveAccessibleName(`${label} ${count}`);
  }
}

async function expectActiveFilter(label: "Locked" | "Unlocked" | "Purchased" | "Archived") {
  await waitFor(() =>
    expect(filterButton(label), `${label} filter should be the active one`).toHaveAttribute("aria-pressed", "true"),
  );
}

function listOf(label: "Locked" | "Unlocked" | "Purchased" | "Archived") {
  return screen.getByRole("list", { name: `${label} wants` });
}

async function dialogsClosed() {
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
}

async function closeSheet(user: User) {
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  await dialogsClosed();
}

async function addExample(user: User) {
  await user.click(await screen.findByRole("button", { name: "Try an example" }));
  return screen.findByRole("article", { name: "Lagavulin 16" });
}

async function openLocked(user: User, name: string) {
  await user.click(screen.getByRole("button", { name: `Update progress on ${name}` }));
  return screen.findByRole("dialog", { name });
}

/** Toggle a dependency in the open sheet and wait for the box to flip. */
async function check(user: User, dialog: HTMLElement, title: string) {
  const wasChecked = within(dialog).getByRole("checkbox", { name: title }).getAttribute("aria-checked") === "true";
  await user.click(within(dialog).getByRole("checkbox", { name: title }));
  await waitFor(() =>
    expect(within(dialog).getByRole("checkbox", { name: title })).toHaveAttribute("aria-checked", String(!wasChecked)),
  );
}

const DEMO_DEPS = ["Pay off one credit card", "Save CAD 145", "Stay within spending plan for 30 days"] as const;

async function unlockExample(user: User) {
  await addExample(user);
  const dialog = await openLocked(user, "Lagavulin 16");
  for (const title of DEMO_DEPS) await check(user, dialog, title);
  await within(dialog).findByRole("heading", { name: "Unlocked. Time to decide." });
  return dialog;
}

const INPUT: WantInput = {
  name: "Placeholder",
  priceCents: 1000,
  dependencies: [{ title: "One" }, { title: "Two" }, { title: "Three" }],
};

function allDone(want: Want, at: Date): Want {
  return want.dependencies.reduce((w, d) => toggleDependency(w, d.id, at), want);
}

function backupFile(wants: Want[], name = "backup.json") {
  return new File([JSON.stringify(createBackup(wants))], name, { type: "application/json" });
}

describe("My Wants app", () => {
  it("adds the example from the empty state and shows it under Locked with filter counts", async () => {
    const { user } = renderApp();

    expect(await screen.findByRole("button", { name: "Add your first want" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter wants" })).not.toBeInTheDocument();

    const card = await addExample(user);

    expect(within(card).getByText("Lagavulin 16")).toBeInTheDocument();
    expect(within(card).getByText("Example")).toBeInTheDocument();
    expect(within(card).getByText("$143.84")).toBeInTheDocument();
    expect(within(card).getByText("Locked · 0 of 3")).toBeInTheDocument();
    expect(within(card).getByRole("progressbar", { name: "0 of 3 dependencies done" })).toBeInTheDocument();
    expect(card).toHaveTextContent("Next: Pay off one credit card");
    expect(within(listOf("Locked")).getAllByRole("article")).toHaveLength(1);

    await expectActiveFilter("Locked");
    expectCounts({ Locked: 1, Unlocked: 0, Purchased: 0, Archived: 0 });
    expect(screen.getByText("1 locked · 0 unlocked · 0 purchased")).toBeInTheDocument();
    // The empty-state button is gone, so focus moves to the new card.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Update progress on Lagavulin 16" })).toHaveFocus(),
    );

    const [demo] = await stored();
    expect(demo).toMatchObject({ id: DEMO_WANT_ID, name: "Lagavulin 16", priceCents: 14384 });
  });

  it("creates a want through the form, refusing to save with only two dependencies", async () => {
    const { user } = renderApp();

    await user.click(await screen.findByRole("button", { name: "Add your first want" }));
    const dialog = await screen.findByRole("dialog", { name: "New want" });

    await user.type(within(dialog).getByLabelText("What do you want?"), "Camera");
    await user.type(within(dialog).getByLabelText("Price"), "899.99");
    await user.type(within(dialog).getByLabelText(/category/i), "Photography");
    await user.type(within(dialog).getByLabelText(/why you want it/i), "Shoot the kids' games.");
    await user.type(within(dialog).getByLabelText("Dependency 1"), "Edit 50 photos");
    await user.type(within(dialog).getByLabelText("Dependency 2"), "Sell old lens");
    await user.click(within(dialog).getByRole("button", { name: "Add detail to dependency 2" }));
    await user.type(within(dialog).getByLabelText("Dependency 2 detail"), "List it on the marketplace");

    await user.click(within(dialog).getByRole("button", { name: "Add want" }));

    const third = within(dialog).getByLabelText("Dependency 3");
    expect(third).toHaveAttribute("aria-invalid", "true");
    expect(third).toHaveAccessibleDescription("Add a title for dependency 3.");
    expect(third).toHaveFocus();
    expect(screen.getByRole("dialog", { name: "New want" })).toBeInTheDocument();
    expect(await stored()).toHaveLength(0);

    await user.type(third, "Finish course");
    await user.click(within(dialog).getByRole("button", { name: "Add want" }));
    await dialogsClosed();

    const card = within(listOf("Locked")).getByRole("article", { name: "Camera" });
    expect(within(card).getByText("$899.99")).toBeInTheDocument();
    expect(within(card).getByText("Locked · 0 of 3")).toBeInTheDocument();
    expect(within(card).queryByText("Example")).not.toBeInTheDocument();
    expect(card).toHaveTextContent("Next: Edit 50 photos");
    await expectActiveFilter("Locked");
    expectCounts({ Locked: 1, Unlocked: 0, Purchased: 0, Archived: 0 });

    const [want] = await stored();
    expect(want).toMatchObject({
      name: "Camera",
      priceCents: 89999,
      currency: "CAD",
      category: "Photography",
      reason: "Shoot the kids' games.",
    });
    expect(want.dependencies.map((d) => [d.title, d.description, d.completed])).toEqual([
      ["Edit 50 photos", undefined, false],
      ["Sell old lens", "List it on the marketplace", false],
      ["Finish course", undefined, false],
    ]);

    // The details show everything that was entered.
    const detail = await openLocked(user, "Camera");
    expect(within(detail).getByText("Photography")).toBeInTheDocument();
    expect(within(detail).getByText("Shoot the kids' games.")).toBeInTheDocument();
    expect(within(detail).getByRole("checkbox", { name: "Sell old lens" })).toHaveAccessibleDescription(
      "List it on the marketplace",
    );
  });

  it("unlocks, defers with Not now, then records a purchase; a locked want has no purchase path", async () => {
    const { user } = renderApp();
    await addExample(user);

    // Locked: the card offers progress, not a decision.
    expect(screen.queryByRole("button", { name: /^Decide/ })).not.toBeInTheDocument();
    const dialog = await openLocked(user, "Lagavulin 16");
    expect(within(dialog).queryByRole("button", { name: /decide|mark purchased/i })).not.toBeInTheDocument();
    expect(within(dialog).getByText("3 more to unlock.")).toBeInTheDocument();

    await check(user, dialog, "Pay off one credit card");
    await check(user, dialog, "Save CAD 145");
    expect(within(dialog).getByText("Locked · 2 of 3")).toBeInTheDocument();
    expect(within(dialog).getByText("1 more to unlock.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /decide|mark purchased/i })).not.toBeInTheDocument();

    await check(user, dialog, "Stay within spending plan for 30 days");
    // The unlock moment is shown in the sheet (no toast covering it).
    expect(await within(dialog).findByText("Unlocked")).toBeInTheDocument();
    expect(screen.queryByText("Lagavulin 16 is unlocked.")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Unlocked. Time to decide." })).toBeInTheDocument();
    // PROJECT.md: both questions, verbatim.
    expect(within(dialog).getByText("Do you still want it?")).toBeInTheDocument();
    expect(within(dialog).getByText("Can you comfortably afford it without adding unwanted debt?")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Decide" }));
    expect(await screen.findByRole("dialog", { name: "Lagavulin 16 is unlocked" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Do you still want it?" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Can you comfortably afford it without adding unwanted debt?" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Not now" }));
    await dialogsClosed();

    // Not now changes nothing; the list follows the want to Unlocked.
    await expectActiveFilter("Unlocked");
    expectCounts({ Locked: 0, Unlocked: 1, Purchased: 0, Archived: 0 });
    const unlockedCard = within(listOf("Unlocked")).getByRole("article", { name: "Lagavulin 16" });
    expect(within(unlockedCard).getByText("Unlocked")).toBeInTheDocument();
    expect(unlockedCard).toHaveTextContent("Ready when you are.");
    let [want] = await stored();
    expect(getStatus(want)).toBe("unlocked");
    expect(want.purchasedAt).toBeUndefined();
    expect(want.archivedAt).toBeUndefined();

    // Reopen straight into the decision from the card.
    await user.click(within(unlockedCard).getByRole("button", { name: "Decide on Lagavulin 16" }));
    const decide = await screen.findByRole("dialog", { name: "Lagavulin 16 is unlocked" });
    await user.click(within(decide).getByRole("button", { name: "Mark purchased" }));
    expect(within(decide).getByRole("heading", { name: "Confirm purchase" })).toBeInTheDocument();

    const day = daysAgo(5);
    fireEvent.change(within(decide).getByLabelText("Purchase date"), { target: { value: toDateInput(day) } });
    await user.type(within(decide).getByLabelText(/final price/i), "129.99");
    await user.click(within(decide).getByRole("button", { name: "Confirm purchase" }));

    expect(await screen.findByText("Marked Lagavulin 16 as purchased.")).toBeInTheDocument();
    await dialogsClosed();
    expectCounts({ Locked: 0, Unlocked: 0, Purchased: 1, Archived: 0 });
    expect(screen.getByText("0 locked · 0 unlocked · 1 purchased")).toBeInTheDocument();

    // The list follows the want to Purchased.
    await expectActiveFilter("Purchased");
    const localNoon = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
    const purchasedCard = within(listOf("Purchased")).getByRole("article", { name: "Lagavulin 16" });
    expect(within(purchasedCard).getByText("Purchased")).toBeInTheDocument();
    expect(purchasedCard).toHaveTextContent(`Bought ${fmt(localNoon)} · Paid $129.99`);
    expect(within(purchasedCard).getByRole("button", { name: "View Lagavulin 16" })).toBeInTheDocument();

    [want] = await stored();
    expect(want.purchasedAt).toBe(localNoon.toISOString());
    expect(want.finalPriceCents).toBe(12999);
    expect(getStatus(want)).toBe("purchased");
  });

  it("relocks an unlocked want when a dependency is unchecked", async () => {
    const { user } = renderApp();
    await unlockExample(user);
    await closeSheet(user);
    await expectActiveFilter("Unlocked");

    const card = within(listOf("Unlocked")).getByRole("article", { name: "Lagavulin 16" });
    await user.click(within(card).getByRole("button", { name: "View details for Lagavulin 16" }));
    const dialog = await screen.findByRole("dialog", { name: "Lagavulin 16" });
    expect(within(dialog).getByRole("button", { name: "Decide" })).toBeInTheDocument();

    await check(user, dialog, "Save CAD 145");

    expect(within(dialog).getByText("Locked · 2 of 3")).toBeInTheDocument();
    expect(within(dialog).getByText("1 more to unlock.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("heading", { name: "Unlocked. Time to decide." })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /decide|mark purchased/i })).not.toBeInTheDocument();

    await closeSheet(user);
    await expectActiveFilter("Locked");
    expectCounts({ Locked: 1, Unlocked: 0, Purchased: 0, Archived: 0 });
    const locked = within(listOf("Locked")).getByRole("article", { name: "Lagavulin 16" });
    expect(within(locked).getByText("Locked · 2 of 3")).toBeInTheDocument();
    expect(locked).toHaveTextContent("Next: Save CAD 145");

    const [want] = await stored();
    expect(getStatus(want)).toBe("locked");
    expect(want.dependencies[1]).toEqual({ id: want.dependencies[1].id, title: "Save CAD 145", completed: false });
  });

  it("archives from the detail footer and restores from the archived card", async () => {
    const { user } = renderApp();
    await addExample(user);

    const dialog = await openLocked(user, "Lagavulin 16");
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));

    expect(await screen.findByText("Archived Lagavulin 16.")).toBeInTheDocument();
    expect(within(dialog).getByText("Archived")).toBeInTheDocument();
    expect(within(dialog).getByText(`Archived ${fmt(new Date())}.`)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();

    await closeSheet(user);
    await expectActiveFilter("Archived");
    expectCounts({ Locked: 0, Unlocked: 0, Purchased: 0, Archived: 1 });
    const card = within(listOf("Archived")).getByRole("article", { name: "Lagavulin 16" });
    expect(within(card).getByText("Archived")).toBeInTheDocument();
    expect(card).toHaveTextContent(`Archived ${fmt(new Date())}`);
    expect(getStatus((await stored())[0])).toBe("archived");

    await user.click(within(card).getByRole("button", { name: "Restore Lagavulin 16" }));

    expect(await screen.findByText("Restored Lagavulin 16.")).toBeInTheDocument();
    await waitFor(() => expectCounts({ Locked: 1, Unlocked: 0, Purchased: 0, Archived: 0 }));
    expect(screen.getByText("Nothing archived. Archive a want to set it aside without deleting it.")).toBeInTheDocument();
    // The pressed card left the list, so focus lands on the current filter.
    await waitFor(() => expect(filterButton("Archived")).toHaveFocus());

    await user.click(filterButton("Locked"));
    const restored = within(listOf("Locked")).getByRole("article", { name: "Lagavulin 16" });
    expect(within(restored).getByText("Locked · 0 of 3")).toBeInTheDocument();
    const [want] = await stored();
    expect(want.archivedAt).toBeUndefined();
    expect(getStatus(want)).toBe("locked");
  });

  it("offers Undo only when archiving closes the sheet", async () => {
    const { user } = renderApp();
    const dialog = await unlockExample(user);

    // Footer Archive keeps the sheet open with its own Restore, so no toast Undo.
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));
    await screen.findByText("Archived Lagavulin 16.");
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Restore" }));
    await screen.findByText("Restored Lagavulin 16.");

    // "Archive instead" closes the sheet, so the toast offers Undo.
    await user.click(within(dialog).getByRole("button", { name: "Decide" }));
    const decide = await screen.findByRole("dialog", { name: "Lagavulin 16 is unlocked" });
    await user.click(within(decide).getByRole("button", { name: "Archive instead" }));
    await dialogsClosed();
    await expectActiveFilter("Archived");
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => expectCounts({ Locked: 0, Unlocked: 1, Purchased: 0, Archived: 0 }));
    expect(getStatus((await stored())[0])).toBe("unlocked");
  });

  it('archives with "Archive instead" and restores an unlocked want to Unlocked', async () => {
    const { user } = renderApp();
    const dialog = await unlockExample(user);

    await user.click(within(dialog).getByRole("button", { name: "Decide" }));
    const decide = await screen.findByRole("dialog", { name: "Lagavulin 16 is unlocked" });
    await user.click(within(decide).getByRole("button", { name: "Archive instead" }));

    expect(await screen.findByText("Archived Lagavulin 16.")).toBeInTheDocument();
    await dialogsClosed();
    expectCounts({ Locked: 0, Unlocked: 0, Purchased: 0, Archived: 1 });
    expect(getStatus((await stored())[0])).toBe("archived");

    // The list follows the want to Archived.
    await expectActiveFilter("Archived");
    // Restore from the details this time; progress is kept, so it comes back unlocked.
    const card = within(listOf("Archived")).getByRole("article", { name: "Lagavulin 16" });
    await user.click(within(card).getByRole("button", { name: "View details for Lagavulin 16" }));
    const detail = await screen.findByRole("dialog", { name: "Lagavulin 16" });
    expect(within(detail).getByText("You can still update these. It stays archived.")).toBeInTheDocument();
    await user.click(within(detail).getByRole("button", { name: "Restore" }));

    expect(await screen.findByText("Restored Lagavulin 16.")).toBeInTheDocument();
    expect(within(detail).getByRole("heading", { name: "Unlocked. Time to decide." })).toBeInTheDocument();
    await closeSheet(user);
    await expectActiveFilter("Unlocked");
    expectCounts({ Locked: 0, Unlocked: 1, Purchased: 0, Archived: 0 });
    const [want] = await stored();
    expect(getStatus(want)).toBe("unlocked");
    expect(completedCount(want)).toBe(3);
  });

  // Regression: the list used to stay on an empty Unlocked filter after a decision.
  describe("follows the want after a decision", () => {
    it("shows Purchased after Confirm purchase", async () => {
      const { user } = renderApp();
      await unlockExample(user);
      await closeSheet(user);
      await expectActiveFilter("Unlocked");

      await user.click(screen.getByRole("button", { name: "Decide on Lagavulin 16" }));
      const decide = await screen.findByRole("dialog", { name: "Lagavulin 16 is unlocked" });
      await user.click(within(decide).getByRole("button", { name: "Mark purchased" }));
      await user.click(within(decide).getByRole("button", { name: "Confirm purchase" }));
      await screen.findByText("Marked Lagavulin 16 as purchased.");
      await dialogsClosed();
      expect(getStatus((await stored())[0])).toBe("purchased");

      await expectActiveFilter("Purchased");
      expect(within(listOf("Purchased")).getByRole("article", { name: "Lagavulin 16" })).toBeInTheDocument();
    });

    it('shows Archived after "Archive instead"', async () => {
      const { user } = renderApp();
      const dialog = await unlockExample(user);

      await user.click(within(dialog).getByRole("button", { name: "Decide" }));
      const decide = await screen.findByRole("dialog", { name: "Lagavulin 16 is unlocked" });
      await user.click(within(decide).getByRole("button", { name: "Archive instead" }));
      await screen.findByText("Archived Lagavulin 16.");
      await dialogsClosed();
      expect(getStatus((await stored())[0])).toBe("archived");

      await expectActiveFilter("Archived");
      expect(within(listOf("Archived")).getByRole("article", { name: "Lagavulin 16" })).toBeInTheDocument();
    });
  });

  it("edits the price and a dependency title, keeping completion", async () => {
    const { user } = renderApp();
    await addExample(user);

    const dialog = await openLocked(user, "Lagavulin 16");
    await check(user, dialog, "Pay off one credit card");
    const [before] = await stored();
    const completedAt = before.dependencies[0].completedAt;
    expect(completedAt).toBeDefined();

    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    const form = await screen.findByRole("dialog", { name: "Edit want" });
    expect(screen.queryByRole("dialog", { name: "Lagavulin 16" })).not.toBeInTheDocument();

    const price = within(form).getByLabelText("Price");
    expect(price).toHaveValue("143.84");
    await user.clear(price);
    await user.type(price, "129.50");
    const first = within(form).getByLabelText("Dependency 1");
    expect(first).toHaveAccessibleDescription("Completed");
    await user.clear(first);
    await user.type(first, "Pay off the Visa");
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    await dialogsClosed();

    const card = within(listOf("Locked")).getByRole("article", { name: "Lagavulin 16" });
    expect(within(card).getByText("$129.50")).toBeInTheDocument();
    expect(within(card).getByText("Locked · 1 of 3")).toBeInTheDocument();
    expect(card).toHaveTextContent("Next: Save CAD 145");

    const detail = await openLocked(user, "Lagavulin 16");
    expect(within(detail).getByText("$129.50")).toBeInTheDocument();
    expect(within(detail).getByRole("checkbox", { name: "Pay off the Visa" })).toBeChecked();
    expect(within(detail).getByRole("checkbox", { name: "Save CAD 145" })).not.toBeChecked();
    expect(within(detail).queryByText("Pay off one credit card")).not.toBeInTheDocument();

    const [after] = await stored();
    expect(after.priceCents).toBe(12950);
    expect(after.dependencies[0]).toMatchObject({ title: "Pay off the Visa", completed: true, completedAt });
    expect(after.dependencies.map((d) => d.id)).toEqual(before.dependencies.map((d) => d.id));
  });

  it("deletes only after confirmation", async () => {
    const { user } = renderApp();
    await addExample(user);
    const dialog = await openLocked(user, "Lagavulin 16");

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    let confirm = await screen.findByRole("alertdialog", { name: "Delete “Lagavulin 16”?" });
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Lagavulin 16" })).toBeInTheDocument();
    expect(await stored()).toHaveLength(1);

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    confirm = await screen.findByRole("alertdialog", { name: "Delete “Lagavulin 16”?" });
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Deleted Lagavulin 16.")).toBeInTheDocument();
    await dialogsClosed();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try an example" })).toBeInTheDocument();
    expect(await stored()).toHaveLength(0);
  });

  describe("import", () => {
    it("rejects malformed or invalid files with a toast and changes nothing", async () => {
      const { user } = renderApp();
      await addExample(user);
      const before = await stored();
      const input = screen.getByTestId("import-input");

      await user.upload(input, new File(['{"app": "my-wants", '], "broken.json", { type: "application/json" }));
      expect(
        await screen.findByText("This file isn't valid JSON. Nothing on this device was changed."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      // Valid JSON, wrong shape: two dependencies instead of three.
      const bad = createBackup([createWant({ ...INPUT, name: "Bad" })]);
      bad.wants[0].dependencies = bad.wants[0].dependencies.slice(0, 2) as never;
      await user.upload(input, new File([JSON.stringify(bad)], "bad.json", { type: "application/json" }));
      expect(
        await screen.findByText(
          'Import failed. Want 1 ("Bad") must have exactly three dependencies. Nothing on this device was changed.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      expectCounts({ Locked: 1, Unlocked: 0, Purchased: 0, Archived: 0 });
      expect(screen.getByRole("article", { name: "Lagavulin 16" })).toBeInTheDocument();
      expect(await stored()).toEqual(before);
    });

    it("merges a backup: previews counts, keeps local wants and adds the file's", async () => {
      const { user } = renderApp();
      await addExample(user);

      const created = new Date(2026, 0, 10, 9);
      const espresso = createWant({ ...INPUT, name: "Espresso machine", priceCents: 64999 }, created);
      const bootsBought = new Date(2026, 1, 3, 12);
      const boots = markPurchased(
        allDone(createWant({ ...INPUT, name: "Hiking boots", priceCents: 22999 }, created), created),
        { purchasedAt: bootsBought, finalPriceCents: 21000 },
        new Date(2026, 1, 4),
      );
      // An older copy of the local example: the newer local copy must win.
      const staleDemo = { ...createDemoWant(new Date(2020, 0, 1)), name: "Old Lagavulin" };

      await user.upload(screen.getByTestId("import-input"), backupFile([espresso, boots, staleDemo]));

      const dialog = await screen.findByRole("dialog", { name: "Import 3 wants" });
      expect(dialog).toHaveTextContent("From backup.json.");
      expect(within(dialog).getByRole("radio", { name: "Merge" })).toBeChecked();
      expect(within(dialog).getByText("2 new · 0 updated · 1 unchanged")).toBeInTheDocument();
      expect(await stored()).toHaveLength(1);

      await user.click(within(dialog).getByRole("button", { name: "Merge" }));

      expect(await screen.findByText("Imported: 2 new, 0 updated.")).toBeInTheDocument();
      await dialogsClosed();
      expectCounts({ Locked: 2, Unlocked: 0, Purchased: 1, Archived: 0 });
      const locked = listOf("Locked");
      expect(within(locked).getByRole("article", { name: "Lagavulin 16" })).toBeInTheDocument();
      expect(within(within(locked).getByRole("article", { name: "Espresso machine" })).getByText("$649.99")).toBeInTheDocument();
      expect(screen.queryByText("Old Lagavulin")).not.toBeInTheDocument();

      await user.click(filterButton("Purchased"));
      const bootsCard = within(listOf("Purchased")).getByRole("article", { name: "Hiking boots" });
      expect(bootsCard).toHaveTextContent(`Bought ${fmt(bootsBought)} · Paid $210.00`);

      const names = (await stored()).map((w) => w.name).sort();
      expect(names).toEqual(["Espresso machine", "Hiking boots", "Lagavulin 16"]);
    });

    it("replaces everything on this device when Replace is chosen", async () => {
      const { user } = renderApp();
      await addExample(user);

      const record = createWant({ ...INPUT, name: "Record player", priceCents: 39900 }, new Date(2026, 2, 1));
      await user.upload(screen.getByTestId("import-input"), backupFile([record], "my-wants-2026-03-01.json"));

      const dialog = await screen.findByRole("dialog", { name: "Import 1 want" });
      await user.click(within(dialog).getByRole("radio", { name: "Replace" }));
      expect(within(dialog).getByRole("radio", { name: "Replace" })).toBeChecked();
      expect(dialog).toHaveTextContent("Deletes the 1 want on this device and replaces them with the file.");
      expect(within(dialog).queryByRole("button", { name: "Merge" })).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Replace everything" }));

      expect(await screen.findByText("Replaced with 1 want.")).toBeInTheDocument();
      await dialogsClosed();
      expectCounts({ Locked: 1, Unlocked: 0, Purchased: 0, Archived: 0 });
      expect(screen.queryByRole("article", { name: "Lagavulin 16" })).not.toBeInTheDocument();
      expect(within(listOf("Locked")).getByRole("article", { name: "Record player" })).toBeInTheDocument();
      expect(await stored()).toEqual([record]);
    });
  });

  it("keeps wants across an app restart", async () => {
    const first = renderApp();
    await addExample(first.user);
    const dialog = await openLocked(first.user, "Lagavulin 16");
    await check(first.user, dialog, "Pay off one credit card");
    await closeSheet(first.user);
    await waitFor(async () => expect(completedCount((await stored())[0])).toBe(1));

    first.unmount();
    // Drop the connection too, so the next mount really reads from IndexedDB.
    await wantRepository.close();

    renderApp();
    const card = await screen.findByRole("article", { name: "Lagavulin 16" });
    expect(within(card).getByText("Example")).toBeInTheDocument();
    expect(within(card).getByText("Locked · 1 of 3")).toBeInTheDocument();
    expect(card).toHaveTextContent("Next: Save CAD 145");
    expectCounts({ Locked: 1, Unlocked: 0, Purchased: 0, Archived: 0 });
  });
});
