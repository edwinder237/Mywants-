import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WantFormDialog } from "@/components/want-form-dialog";
import { compressImage, ImageError } from "@/lib/image";
import type { PurchaseInput, Want, WantInput } from "@/lib/wants";

vi.mock("@/lib/image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image")>()),
  compressImage: vi.fn(),
}));

const compress = vi.mocked(compressImage);
const PHOTO = "data:image/jpeg;base64,AAAA";

type SubmitFn = (input: WantInput, purchase?: PurchaseInput) => Promise<unknown>;

function setup(options: { want?: Want | null; onSubmit?: SubmitFn } = {}) {
  const onSubmit = vi.fn<SubmitFn>(options.onSubmit ?? (async () => undefined));
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  render(
    <WantFormDialog
      open
      onOpenChange={onOpenChange}
      want={options.want}
      categories={["Treat", "Tech"]}
      onSubmit={onSubmit}
    />,
  );
  const dialog = screen.getByRole("dialog");
  return { user, dialog, onSubmit, onOpenChange };
}

function makeWant(overrides: Partial<Want> = {}): Want {
  return {
    id: "w1",
    name: "Lagavulin 16",
    priceCents: 14384,
    currency: "CAD",
    category: "Treat",
    reason: "A slow Friday dram.",
    dependencies: [
      { id: "d1", title: "Pay off one credit card", completed: true, completedAt: "2026-03-01T10:00:00.000Z" },
      { id: "d2", title: "Save CAD 145", description: "Separate savings account", completed: false },
      { id: "d3", title: "Stay within spending plan for 30 days", completed: false },
    ],
    createdAt: "2026-02-01T10:00:00.000Z",
    updatedAt: "2026-02-01T10:00:00.000Z",
    ...overrides,
  };
}

function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, skipThird = false) {
  await user.type(within(dialog).getByLabelText("What do you want?"), "Camera");
  await user.type(within(dialog).getByLabelText("Price"), "899.99");
  await user.type(within(dialog).getByLabelText("Dependency 1"), "Edit 50 photos");
  await user.type(within(dialog).getByLabelText("Dependency 2"), "Sell old lens");
  if (!skipThird) await user.type(within(dialog).getByLabelText("Dependency 3"), "Finish course");
}

beforeEach(() => {
  compress.mockReset();
});

describe("WantFormDialog", () => {
  it("creates a want with a trimmed WantInput in CAD cents", async () => {
    const { user, dialog, onSubmit, onOpenChange } = setup();

    expect(within(dialog).getByRole("heading", { name: "New want" })).toBeInTheDocument();
    expect(within(dialog).getByText("CAD")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Price")).toHaveAttribute("inputmode", "decimal");
    expect(within(dialog).getByLabelText("Dependency 3")).toHaveAttribute(
      "placeholder",
      "e.g. On budget for 30 days",
    );

    await user.type(within(dialog).getByLabelText("What do you want?"), "  Lagavulin 16  ");
    await user.type(within(dialog).getByLabelText("Price"), "$1,143.80");
    await user.type(within(dialog).getByLabelText(/category/i), " Treat ");
    await user.type(within(dialog).getByLabelText(/why you want it/i), "  A slow Friday dram. ");
    await user.type(within(dialog).getByLabelText("Dependency 1"), " Pay off one credit card ");
    await user.type(within(dialog).getByLabelText("Dependency 2"), "Save CAD 145");
    await user.type(within(dialog).getByLabelText("Dependency 3"), "Stay within spending plan for 30 days");

    await user.click(within(dialog).getByRole("button", { name: "Add detail to dependency 2" }));
    const detail = within(dialog).getByLabelText("Dependency 2 detail");
    expect(detail).toHaveFocus();
    await user.type(detail, "  Separate savings account  ");

    await user.click(within(dialog).getByRole("button", { name: "Add want" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]).toHaveLength(1);
    expect(onSubmit.mock.calls[0][0]).toStrictEqual({
      name: "Lagavulin 16",
      priceCents: 114380,
      category: "Treat",
      reason: "A slow Friday dram.",
      imageData: undefined,
      dependencies: [
        { title: "Pay off one credit card", description: undefined },
        { title: "Save CAD 145", description: "Separate savings account" },
        { title: "Stay within spending plan for 30 days", description: undefined },
      ],
    });
  });

  it("refuses to save with a blank third dependency and focuses it", async () => {
    const { user, dialog, onSubmit, onOpenChange } = setup();
    await fillRequired(user, dialog, true);

    await user.click(within(dialog).getByRole("button", { name: "Add want" }));

    const third = within(dialog).getByLabelText("Dependency 3");
    expect(third).toHaveAttribute("aria-invalid", "true");
    expect(third).toHaveFocus();
    expect(third).toHaveAccessibleDescription("Add a title for dependency 3.");
    expect(within(dialog).getByLabelText("Dependency 1")).not.toHaveAttribute("aria-invalid");
    // A single error is described at the field; no summary.
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.type(third, "Finish course");
    expect(third).not.toHaveAttribute("aria-invalid");
    await user.click(within(dialog).getByRole("button", { name: "Add want" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("flags an invalid price and summarises several errors", async () => {
    const { user, dialog, onSubmit } = setup();
    await user.type(within(dialog).getByLabelText("Price"), "12.345");
    await user.click(within(dialog).getByRole("button", { name: "Add want" }));

    const price = within(dialog).getByLabelText("Price");
    expect(price).toHaveAttribute("aria-invalid", "true");
    expect(price).toHaveAccessibleDescription(/CAD\s+Enter a price like 143\.84\./);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("5 fields need a quick look before saving.");
    // Focus goes to the first invalid field in screen order.
    expect(within(dialog).getByLabelText("What do you want?")).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("prefills every field in edit mode and reveals existing details", async () => {
    const want = makeWant();
    const { user, dialog, onSubmit } = setup({ want });

    expect(within(dialog).getByRole("heading", { name: "Edit want" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("What do you want?")).toHaveValue("Lagavulin 16");
    expect(within(dialog).getByLabelText("Price")).toHaveValue("143.84");
    expect(within(dialog).getByLabelText(/category/i)).toHaveValue("Treat");
    expect(within(dialog).getByLabelText(/why you want it/i)).toHaveValue("A slow Friday dram.");
    expect(within(dialog).getByLabelText("Dependency 1")).toHaveValue("Pay off one credit card");
    expect(within(dialog).getByLabelText("Dependency 1")).toHaveAccessibleDescription("Completed");
    expect(within(dialog).getByLabelText("Dependency 2 detail")).toHaveValue("Separate savings account");
    expect(within(dialog).getByRole("button", { name: "Add detail to dependency 1" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Add detail to dependency 2" })).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Purchase date")).not.toBeInTheDocument();

    const priceField = within(dialog).getByLabelText("Price");
    await user.clear(priceField);
    await user.type(priceField, "139.99");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]).toHaveLength(1);
    expect(onSubmit.mock.calls[0][0]).toStrictEqual({
      name: "Lagavulin 16",
      priceCents: 13999,
      category: "Treat",
      reason: "A slow Friday dram.",
      imageData: undefined,
      dependencies: [
        { title: "Pay off one credit card", description: undefined },
        { title: "Save CAD 145", description: "Separate savings account" },
        { title: "Stay within spending plan for 30 days", description: undefined },
      ],
    });
  });

  it("edits purchase details of a purchased want with a local-noon date", async () => {
    const purchasedAt = "2026-03-10T17:00:00.000Z";
    const want = makeWant({ purchasedAt, finalPriceCents: 13999 });
    const { user, dialog, onSubmit } = setup({ want });

    const date = within(dialog).getByLabelText("Purchase date");
    expect(date).toHaveValue(localDay(new Date(purchasedAt)));
    expect(date).toHaveAttribute("max", localDay(new Date()));
    const finalPrice = within(dialog).getByLabelText(/final price/i);
    expect(finalPrice).toHaveValue("139.99");

    // A future day is refused.
    fireEvent.change(date, { target: { value: "2999-01-01" } });
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(date).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(date, { target: { value: "2026-03-14" } });
    await user.clear(finalPrice);
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [input, purchase] = onSubmit.mock.calls[0];
    expect(input.name).toBe("Lagavulin 16");
    expect(purchase).toStrictEqual({ purchasedAt: expect.any(Date), finalPriceCents: undefined });
    const when = purchase!.purchasedAt!;
    expect([when.getFullYear(), when.getMonth(), when.getDate(), when.getHours(), when.getMinutes()]).toEqual([
      2026, 2, 14, 12, 0,
    ]);
  });

  it("keeps the original purchase time and parses a final price when the date is untouched", async () => {
    const purchasedAt = "2026-03-10T17:23:00.000Z";
    const { user, dialog, onSubmit } = setup({ want: makeWant({ purchasedAt }) });

    await user.type(within(dialog).getByLabelText(/final price/i), "120");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const purchase = onSubmit.mock.calls[0][1]!;
    expect(purchase.purchasedAt?.toISOString()).toBe(purchasedAt);
    expect(purchase.finalPriceCents).toBe(12000);
  });

  it("shows a save error inline and keeps the form open", async () => {
    let fail = true;
    const { user, dialog, onSubmit, onOpenChange } = setup({
      onSubmit: async () => {
        if (fail) throw new Error("Storage is full. Export a backup and remove a photo.");
      },
    });
    await fillRequired(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Add want" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Storage is full. Export a backup and remove a photo.",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Add want" })).toBeEnabled();
    expect(within(dialog).getByLabelText("What do you want?")).toHaveValue("Camera");

    fail = false;
    await user.click(within(dialog).getByRole("button", { name: "Add want" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("disables the submit button while saving", async () => {
    let resolve!: () => void;
    const { user, dialog, onOpenChange } = setup({
      onSubmit: () => new Promise<void>((r) => (resolve = r)),
    });
    await fillRequired(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Add want" }));

    expect(within(dialog).getByRole("button", { name: "Saving…" })).toBeDisabled();
    resolve();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("adds a compressed photo and includes it in the input", async () => {
    let finish!: (value: string) => void;
    compress.mockImplementation(() => new Promise<string>((r) => (finish = r)));
    const { user, dialog, onSubmit } = setup();

    expect(within(dialog).getByText("Stored on this device only, resized to save space.")).toBeInTheDocument();
    const fileInput = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(fileInput).toHaveAttribute("accept", "image/*");
    const file = new File(["x"], "bottle.png", { type: "image/png" });
    await user.upload(fileInput, file);

    expect(compress).toHaveBeenCalledWith(file);
    expect(within(dialog).getByRole("status")).toHaveTextContent("Preparing photo…");
    expect(within(dialog).getByRole("button", { name: "Add want" })).toBeDisabled();

    finish(PHOTO);
    const preview = await within(dialog).findByRole("img", { name: "Selected photo" });
    expect(preview).toHaveAttribute("src", PHOTO);
    expect(within(dialog).getByRole("button", { name: "Change photo" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Remove photo" })).toBeInTheDocument();

    await fillRequired(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Add want" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].imageData).toBe(PHOTO);
  });

  it("shows image errors inline and can remove a photo", async () => {
    compress.mockRejectedValueOnce(new ImageError("That image couldn't be read. Try a JPEG or PNG."));
    const { user, dialog, onSubmit } = setup({ want: makeWant({ imageData: PHOTO }) });
    const fileInput = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;

    await user.upload(fileInput, new File(["x"], "broken.png", { type: "image/png" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "That image couldn't be read. Try a JPEG or PNG.",
    );
    // The existing photo stays.
    expect(within(dialog).getByRole("img", { name: "Selected photo" })).toHaveAttribute("src", PHOTO);

    await user.click(within(dialog).getByRole("button", { name: "Remove photo" }));
    expect(within(dialog).queryByRole("img", { name: "Selected photo" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add photo" })).toHaveFocus();

    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].imageData).toBeUndefined();
  });
});
