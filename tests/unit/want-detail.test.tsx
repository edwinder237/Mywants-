import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WantDetailDialog, type WantDetailDialogProps } from "@/components/want-detail-dialog";
import {
  archiveWant,
  createDemoWant,
  createWant,
  markPurchased,
  restoreWant,
  toggleDependency,
  type Want,
  type WantInput,
} from "@/lib/wants";

const NOW = new Date(2026, 9, 20, 9, 30);
const fmt = (d: Date) => d.toLocaleDateString("en-CA", { dateStyle: "medium" });

function makeWant(overrides: Partial<WantInput> = {}): Want {
  return createWant(
    {
      name: "Lagavulin 16",
      priceCents: 14384,
      category: "Treat",
      reason: "A slow dram after a big week.",
      dependencies: [
        { title: "Pay off one credit card" },
        { title: "Save CAD 145", description: "Into the treats jar" },
        { title: "Stay within spending plan for 30 days" },
      ],
      ...overrides,
    },
    NOW,
  );
}

/** Complete the first `count` dependencies. */
function withDone(want: Want, count: number): Want {
  return want.dependencies.slice(0, count).reduce((w, dep) => toggleDependency(w, dep.id, NOW), want);
}

function setup(want: Want | null, props: Partial<WantDetailDialogProps> = {}) {
  const handlers = {
    onOpenChange: vi.fn(),
    onToggle: vi.fn<(dependencyId: string) => Promise<boolean>>(async () => true),
    onPurchase: vi.fn(async () => true),
    onArchive: vi.fn(async () => true),
    onRestore: vi.fn(async () => true),
    onDelete: vi.fn(async () => true),
    onEdit: vi.fn(),
  };
  const user = userEvent.setup();
  const view = render(<WantDetailDialog want={want} {...handlers} {...props} />);
  const rerender = (next: Want | null, extra: Partial<WantDetailDialogProps> = {}) =>
    view.rerender(<WantDetailDialog want={next} {...handlers} {...props} {...extra} />);
  return { user, handlers, rerender };
}

function noHandlerCalled(handlers: ReturnType<typeof setup>["handlers"]) {
  for (const fn of [
    handlers.onToggle,
    handlers.onPurchase,
    handlers.onArchive,
    handlers.onRestore,
    handlers.onDelete,
    handlers.onEdit,
  ]) {
    expect(fn).not.toHaveBeenCalled();
  }
}

describe("WantDetailDialog", () => {
  it("shows a locked want with its progress and no purchase action", async () => {
    setup(withDone(makeWant(), 1));
    const dialog = await screen.findByRole("dialog", { name: "Lagavulin 16" });

    expect(within(dialog).getByText("Locked · 1 of 3")).toBeInTheDocument();
    expect(within(dialog).getByText("$143.84")).toBeInTheDocument();
    expect(within(dialog).getByText("A slow dram after a big week.")).toBeInTheDocument();
    expect(within(dialog).getByText("Treat")).toBeInTheDocument();
    expect(within(dialog).getByRole("progressbar", { name: "1 of 3 dependencies done" })).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(within(dialog).getByText("2 more to unlock.")).toBeInTheDocument();
    expect(within(dialog).getByText(`Done ${fmt(NOW)}`)).toBeInTheDocument();
    expect(within(dialog).queryByText("Example")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /mark purchased|decide/i })).not.toBeInTheDocument();
    // Focus starts on the title, not on the first checkbox.
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: "Lagavulin 16" })).toHaveFocus());
  });

  it("labels the example want", async () => {
    setup(createDemoWant(NOW));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Example")).toBeInTheDocument();
  });

  it("toggles a dependency from the checkbox or anywhere on its row", async () => {
    const want = makeWant();
    const { user, handlers } = setup(want);
    const dialog = await screen.findByRole("dialog");

    const box = within(dialog).getByRole("checkbox", { name: "Save CAD 145" });
    expect(box).toHaveAccessibleDescription("Into the treats jar");
    await user.click(box);
    expect(handlers.onToggle).toHaveBeenLastCalledWith(want.dependencies[1].id);

    await user.click(within(dialog).getByText("Pay off one credit card"));
    expect(handlers.onToggle).toHaveBeenLastCalledWith(want.dependencies[0].id);
    expect(handlers.onToggle).toHaveBeenCalledTimes(2);
  });

  it("asks both questions when unlocked and opens the decision view", async () => {
    const { user } = setup(withDone(makeWant(), 3));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Unlocked")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Unlocked. Time to decide." })).toBeInTheDocument();
    expect(within(dialog).getByText("Do you still want it?")).toBeInTheDocument();
    expect(within(dialog).getByText("Can you comfortably afford it without adding unwanted debt?")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Unlocking means you can reconsider buying it — it isn't a sign you can afford it."),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Decide" }));

    const heading = within(dialog).getByRole("heading", { name: "Lagavulin 16 is unlocked" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(within(dialog).getByRole("heading", { name: "Do you still want it?" })).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "Can you comfortably afford it without adding unwanted debt?" }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Back to details" }));
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: "Lagavulin 16" })).toHaveFocus());
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(3);
  });

  it("confirms a purchase with a local-noon date and the parsed final price, then closes", async () => {
    const { user, handlers } = setup(withDone(makeWant(), 3), { initialView: "decide" });
    const dialog = await screen.findByRole("dialog", { name: "Lagavulin 16 is unlocked" });

    await user.click(within(dialog).getByRole("button", { name: "Mark purchased" }));
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: "Confirm purchase" })).toHaveFocus());

    fireEvent.change(within(dialog).getByLabelText("Purchase date"), { target: { value: "2026-10-18" } });
    const price = within(dialog).getByLabelText(/final price/i);
    expect(price).toHaveAttribute("placeholder", "143.84");
    await user.type(price, "$129.99");
    await user.click(within(dialog).getByRole("button", { name: "Confirm purchase" }));

    expect(handlers.onPurchase).toHaveBeenCalledTimes(1);
    expect(handlers.onPurchase).toHaveBeenCalledWith({
      purchasedAt: new Date(2026, 9, 18, 12, 0, 0),
      finalPriceCents: 12999,
    });
    await waitFor(() => expect(handlers.onOpenChange).toHaveBeenCalledWith(false));
  });

  it("defaults the purchase date to today and leaves the final price out when blank", async () => {
    const { user, handlers } = setup(withDone(makeWant(), 3), { initialView: "decide" });
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Mark purchased" }));
    await user.click(within(dialog).getByRole("button", { name: "Confirm purchase" }));

    const today = new Date();
    expect(handlers.onPurchase).toHaveBeenCalledWith({
      purchasedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12),
    });
  });

  it("blocks an invalid final price or a future date with inline errors", async () => {
    const { user, handlers } = setup(withDone(makeWant(), 3), { initialView: "decide" });
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Mark purchased" }));
    const price = within(dialog).getByLabelText(/final price/i);
    await user.type(price, "about 20");
    await user.click(within(dialog).getByRole("button", { name: "Confirm purchase" }));

    expect(handlers.onPurchase).not.toHaveBeenCalled();
    expect(handlers.onOpenChange).not.toHaveBeenCalled();
    expect(price).toHaveAttribute("aria-invalid", "true");
    expect(price).toHaveAccessibleDescription(expect.stringContaining("Enter a price like 129.99"));
    expect(price).toHaveFocus();

    await user.clear(price);
    const date = within(dialog).getByLabelText("Purchase date");
    fireEvent.change(date, { target: { value: "2999-01-01" } });
    await user.click(within(dialog).getByRole("button", { name: "Confirm purchase" }));

    expect(handlers.onPurchase).not.toHaveBeenCalled();
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(date).toHaveAccessibleDescription("The purchase date can't be in the future.");
    expect(date).toHaveFocus();
  });

  it('"Not now" closes without changing anything', async () => {
    const { user, handlers } = setup(withDone(makeWant(), 3), { initialView: "decide" });
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Not now" }));

    expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
    noHandlerCalled(handlers);
  });

  it('"Archive instead" archives and closes', async () => {
    const { user, handlers } = setup(withDone(makeWant(), 3), { initialView: "decide" });
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Archive instead" }));

    expect(handlers.onArchive).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(handlers.onOpenChange).toHaveBeenCalledWith(false));
  });

  it("archives from the footer and keeps the sheet open", async () => {
    const want = makeWant();
    const { user, handlers } = setup(want);
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Archive" }));

    expect(handlers.onArchive).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenChange).not.toHaveBeenCalled();
  });

  it("shows an archived want with Restore", async () => {
    const want = archiveWant(withDone(makeWant(), 1), NOW);
    const { user, handlers } = setup(want);
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Archived")).toBeInTheDocument();
    expect(within(dialog).getByText(`Archived ${fmt(NOW)}.`)).toBeInTheDocument();
    expect(within(dialog).getByText("You can still update these. It stays archived.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(handlers.onRestore).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenChange).not.toHaveBeenCalled();
  });

  it("shows the purchase date and the amount paid", async () => {
    const purchasedAt = new Date(2026, 9, 20, 12);
    const want = markPurchased(
      withDone(makeWant(), 3),
      { purchasedAt, finalPriceCents: 12999 },
      new Date(2026, 9, 21),
    );
    setup(want);
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Purchased")).toBeInTheDocument();
    expect(within(dialog).getByText("Paid $129.99")).toBeInTheDocument();
    expect(within(dialog).getByText("Listed $143.84")).toBeInTheDocument();
    expect(within(dialog).getByText(`Purchased ${fmt(purchasedAt)} for $129.99.`)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /^archive$|decide|mark purchased/i })).not.toBeInTheDocument();
    // Dependencies stay editable after purchase.
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(3);
    expect(within(dialog).getByText("You can still update these. It stays purchased.")).toBeInTheDocument();
  });

  it("asks before deleting", async () => {
    const { user, handlers } = setup(makeWant());
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    let confirm = await screen.findByRole("alertdialog", { name: "Delete “Lagavulin 16”?" });
    expect(confirm).toHaveTextContent("This removes it from this device and can't be undone.");
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(handlers.onDelete).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(handlers.onOpenChange).toHaveBeenCalledWith(false));
  });

  it("celebrates when the third dependency completes while open", async () => {
    const twoDone = withDone(makeWant(), 2);
    const { rerender } = setup(twoDone);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("1 more to unlock.")).toBeInTheDocument();

    rerender(toggleDependency(twoDone, twoDone.dependencies[2].id, NOW));

    const heading = within(dialog).getByRole("heading", { name: "Unlocked. Time to decide." });
    expect(heading.closest("section")).toHaveClass("motion-safe:animate-unlock-pop");
    expect(within(dialog).getByText("Unlocked").closest("[data-status]")).toHaveClass(
      "motion-safe:animate-unlock-glow",
    );
    await waitFor(() => expect(heading).toHaveFocus());
    expect(within(dialog).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");

    // Archiving and restoring the same want later is not another unlock moment.
    const unlocked = toggleDependency(twoDone, twoDone.dependencies[2].id, NOW);
    const archived = archiveWant(unlocked, NOW);
    rerender(archived);
    rerender(restoreWant(archived, NOW));
    expect(
      within(dialog).getByRole("heading", { name: "Unlocked. Time to decide." }).closest("section"),
    ).not.toHaveClass("motion-safe:animate-unlock-pop");
  });

  it("does not celebrate when an unlocked want is opened", async () => {
    setup(withDone(makeWant(), 3));
    const dialog = await screen.findByRole("dialog");

    const heading = within(dialog).getByRole("heading", { name: "Unlocked. Time to decide." });
    expect(heading.closest("section")).not.toHaveClass("motion-safe:animate-unlock-pop");
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: "Lagavulin 16" })).toHaveFocus());
  });

  it("falls back to details if the want relocks during the decision", async () => {
    const unlocked = withDone(makeWant(), 3);
    const { rerender } = setup(unlocked, { initialView: "decide" });
    const dialog = await screen.findByRole("dialog", { name: "Lagavulin 16 is unlocked" });

    rerender(toggleDependency(unlocked, unlocked.dependencies[0].id, NOW));

    expect(within(dialog).queryByRole("button", { name: "Mark purchased" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("1 more to unlock.")).toBeInTheDocument();
  });

  it("opens each want in its initial view", async () => {
    const first = withDone(makeWant(), 3);
    const second = withDone(makeWant({ name: "Film camera" }), 3);
    const { user, rerender } = setup(first);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Decide" }));
    expect(within(dialog).getByRole("heading", { name: "Lagavulin 16 is unlocked" })).toBeInTheDocument();

    rerender(second);

    expect(await screen.findByRole("dialog", { name: "Film camera" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decide" })).toBeInTheDocument();
  });
});
