import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MyWantsApp } from "@/components/my-wants-app";
import { Toaster } from "@/components/ui/sonner";
import { closeDb, loadWants, replaceAllWants } from "@/lib/db";

function renderApp() {
  return render(
    <>
      <MyWantsApp />
      <Toaster />
    </>,
  );
}

beforeEach(async () => {
  await replaceAllWants([]);
  await closeDb();
});

describe("My Wants app", () => {
  it("adds the sample, unlocks it, and purchases only after unlocking", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /try a sample want/i }));
    await user.click(await screen.findByRole("button", { name: /lagavulin 16/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Sample")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /mark as purchased/i })).not.toBeInTheDocument();

    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    expect(within(dialog).getByText(/1 more to unlock/i)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /mark as purchased/i })).not.toBeInTheDocument();

    await user.click(boxes[2]);
    await user.click(await within(dialog).findByRole("button", { name: /mark as purchased/i }));

    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(/doesn't mean this fits your budget/i);
    await user.click(within(confirm).getByRole("button", { name: /^mark purchased$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: /purchased/i }));
    expect(await screen.findByRole("button", { name: /lagavulin 16/i })).toHaveTextContent(/bought/i);

    const [stored] = await loadWants();
    expect(stored.purchasedAt).not.toBeNull();
  });

  it("requires all three dependencies in the form", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /add your first want/i }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/what do you want/i), "Camera");
    await user.type(within(dialog).getByLabelText(/^price$/i), "899.99");
    await user.type(within(dialog).getByLabelText("Dependency 1"), "Edit 50 photos");
    await user.type(within(dialog).getByLabelText("Dependency 2"), "Sell old lens");
    await user.click(within(dialog).getByRole("button", { name: /add want/i }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/all three dependencies/i);
    expect(await loadWants()).toHaveLength(0);

    await user.type(within(dialog).getByLabelText("Dependency 3"), "Finish course");
    await user.click(within(dialog).getByRole("button", { name: /add want/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const card = await screen.findByRole("button", { name: /camera/i });
    expect(card).toHaveTextContent("$899.99");
    expect(card).toHaveTextContent(/0 of 3/);
    const [stored] = await loadWants();
    expect(stored.priceCents).toBe(89999);
  });

  it("loads persisted wants on start", async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(await screen.findByRole("button", { name: /try a sample want/i }));
    await screen.findByRole("button", { name: /lagavulin 16/i });
    first.unmount();
    await closeDb();

    renderApp();
    expect(await screen.findByRole("button", { name: /lagavulin 16/i })).toBeInTheDocument();
  });
});
