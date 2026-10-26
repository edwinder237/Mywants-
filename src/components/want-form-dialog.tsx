"use client";

import { useId, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { CheckIcon, CircleAlertIcon, PlusIcon } from "lucide-react";

import { ImageField } from "@/components/image-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { centsToInput, formatPrice, parsePriceToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  CURRENCY,
  LIMITS,
  isValidCents,
  validateInput,
  type PurchaseInput,
  type Want,
  type WantInput,
} from "@/lib/wants";

export interface WantFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when set; create mode when null/undefined. */
  want?: Want | null;
  /** Existing categories for suggestions (datalist). */
  categories: string[];
  /** Persist. Throws Error with a user-facing message on failure (show it inline, keep the form open). */
  onSubmit: (input: WantInput, purchase?: PurchaseInput) => Promise<unknown>;
  onCloseAutoFocus?: (event: Event) => void;
}

export function WantFormDialog({
  open,
  onOpenChange,
  want = null,
  categories,
  onSubmit,
  onCloseAutoFocus,
}: WantFormDialogProps) {
  // Keep showing the same want while the sheet animates closed, even if the parent clears it.
  const [shown, setShown] = useState(want);
  if (open && want !== shown) setShown(want);

  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => {
          // Editing: start at the title instead of selecting the name (which pops the keyboard).
          if (!shown) return;
          event.preventDefault();
          contentRef.current?.querySelector<HTMLElement>('[data-slot="dialog-title"]')?.focus();
        }}
      >
        {/* Radix unmounts closed content, so each open starts with a fresh form. */}
        <WantForm
          key={shown?.id ?? "new"}
          want={shown}
          categories={categories}
          onSubmit={onSubmit}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

const PLACEHOLDERS = [
  "e.g. Pay off one credit card",
  "e.g. Save CAD 145",
  "e.g. On budget for 30 days",
] as const;

const DEP_KEYS = [
  ["dep0", "dep0Description"],
  ["dep1", "dep1Description"],
  ["dep2", "dep2Description"],
] as const;

type FieldKey =
  | "name"
  | "price"
  | "category"
  | "reason"
  | (typeof DEP_KEYS)[number][number]
  | "purchaseDate"
  | "finalPrice";

/** Same order as the fields on screen, so the first error gets focus. */
const FIELD_ORDER: FieldKey[] = [
  "name",
  "price",
  "category",
  "reason",
  ...DEP_KEYS.flat(),
  "purchaseDate",
  "finalPrice",
];

type Errors = Partial<Record<FieldKey, string>>;

interface DependencyDraft {
  title: string;
  description: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar day as YYYY-MM-DD, the value format of <input type="date">. */
function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local noon on the chosen day, so no time zone can push it onto a neighbouring date. */
function fromDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number(match[1]) >= 1970 && toDateInput(date) === value ? date : null;
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function tooLong(max: number): string {
  return `Keep this to ${max} characters or fewer.`;
}

const PRICE_TOO_HIGH = `Enter a price up to ${formatPrice(LIMITS.priceCents)}.`;

function WantForm({
  want,
  categories,
  onSubmit,
  onDone,
}: {
  want: Want | null;
  categories: string[];
  onSubmit: WantFormDialogProps["onSubmit"];
  onDone: () => void;
}) {
  const uid = useId();
  const fieldId = (key: FieldKey) => `${uid}-${key}`;
  const errorId = (key: FieldKey) => `${uid}-${key}-error`;
  const currencyId = `${uid}-currency`;
  const finalCurrencyId = `${uid}-final-currency`;
  const finalHintId = `${uid}-final-hint`;
  const categoryListId = `${uid}-categories`;

  const editing = want !== null;
  const purchasedAt = want?.purchasedAt;
  const initialDate = purchasedAt ? toDateInput(new Date(purchasedAt)) : "";

  const [today] = useState(() => toDateInput(new Date()));
  const [name, setName] = useState(want?.name ?? "");
  const [price, setPrice] = useState(want ? centsToInput(want.priceCents) : "");
  const [imageData, setImageData] = useState(want?.imageData);
  const [imageBusy, setImageBusy] = useState(false);
  const [category, setCategory] = useState(want?.category ?? "");
  const [reason, setReason] = useState(want?.reason ?? "");
  const [deps, setDeps] = useState<DependencyDraft[]>(() =>
    want
      ? want.dependencies.map((d) => ({ title: d.title, description: d.description ?? "" }))
      : DEP_KEYS.map(() => ({ title: "", description: "" })),
  );
  const [revealed, setRevealed] = useState(() => deps.map((d) => d.description !== ""));
  const [purchaseDate, setPurchaseDate] = useState(initialDate);
  const [finalPrice, setFinalPrice] = useState(
    want?.finalPriceCents !== undefined ? centsToInput(want.finalPriceCents) : "",
  );
  const [errors, setErrors] = useState<Errors>({});
  const [summaryCount, setSummaryCount] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function clearError(key: FieldKey) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  /** id + invalid state wiring for a field, with optional extra description ids. */
  function fieldProps(key: FieldKey, ...describedBy: (string | false | undefined)[]) {
    const invalid = Boolean(errors[key]);
    const ids = [...describedBy, invalid && errorId(key)].filter(Boolean).join(" ");
    return {
      id: fieldId(key),
      "aria-invalid": invalid || undefined,
      "aria-describedby": ids || undefined,
    };
  }

  function updateDep(index: number, part: keyof DependencyDraft, value: string) {
    setDeps((prev) => prev.map((d, i) => (i === index ? { ...d, [part]: value } : d)));
    clearError(DEP_KEYS[index][part === "title" ? 0 : 1]);
  }

  function revealDescription(index: number) {
    flushSync(() => setRevealed((prev) => prev.map((v, i) => v || i === index)));
    document.getElementById(fieldId(DEP_KEYS[index][1]))?.focus();
  }

  function check(): { errors: Errors; input: WantInput; purchase?: PurchaseInput } {
    const found: Errors = {};

    const trimmedName = name.trim();
    if (!trimmedName) found.name = "Give your want a name.";
    else if (trimmedName.length > LIMITS.name) found.name = tooLong(LIMITS.name);

    const priceCents = parsePriceToCents(price);
    if (!price.trim()) found.price = "Enter a price.";
    else if (priceCents === null) found.price = "Enter a price like 143.84.";
    else if (!isValidCents(priceCents)) found.price = PRICE_TOO_HIGH;

    if (category.trim().length > LIMITS.category) found.category = tooLong(LIMITS.category);
    if (reason.trim().length > LIMITS.reason) found.reason = tooLong(LIMITS.reason);

    deps.forEach((dep, i) => {
      const [titleKey, descriptionKey] = DEP_KEYS[i];
      const title = dep.title.trim();
      if (!title) found[titleKey] = `Add a title for dependency ${i + 1}.`;
      else if (title.length > LIMITS.dependencyTitle) found[titleKey] = tooLong(LIMITS.dependencyTitle);
      if (dep.description.trim().length > LIMITS.dependencyDescription) {
        found[descriptionKey] = tooLong(LIMITS.dependencyDescription);
      }
    });

    let purchase: PurchaseInput | undefined;
    if (purchasedAt) {
      const date = fromDateInput(purchaseDate);
      if (!purchaseDate) found.purchaseDate = "Choose the day you bought it.";
      else if (!date) found.purchaseDate = "Enter a valid date.";
      else if (purchaseDate > today) found.purchaseDate = "The purchase date can't be in the future.";

      const finalCents = finalPrice.trim() ? parsePriceToCents(finalPrice) : undefined;
      if (finalCents === null) found.finalPrice = "Enter a price like 143.84, or leave it blank.";
      else if (finalCents !== undefined && !isValidCents(finalCents)) found.finalPrice = PRICE_TOO_HIGH;

      purchase = {
        // An untouched date keeps its original time instead of being moved to noon.
        purchasedAt: purchaseDate === initialDate ? new Date(purchasedAt) : (date ?? undefined),
        finalPriceCents: finalCents ?? undefined,
      };
    }

    const input: WantInput = {
      name: trimmedName,
      priceCents: priceCents ?? 0,
      category: optional(category),
      reason: optional(reason),
      imageData,
      dependencies: deps.map((d) => ({
        title: d.title.trim(),
        description: optional(d.description),
      })) as WantInput["dependencies"],
    };
    return { errors: found, input, purchase };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || imageBusy) return;

    const { errors: found, input, purchase } = check();
    const invalid = FIELD_ORDER.filter((key) => found[key]);
    // Commit aria-invalid and messages before moving focus, so they're announced with the field.
    flushSync(() => {
      setErrors(found);
      setSummaryCount(invalid.length);
      setSubmitError(null);
    });
    if (invalid.length > 0) {
      document.getElementById(fieldId(invalid[0]))?.focus();
      return;
    }

    // Last guard: the model's own rules (e.g. image format).
    const ruleError = validateInput(input)[0];
    if (ruleError) {
      setSubmitError(ruleError);
      return;
    }

    setSaving(true);
    try {
      await (purchase ? onSubmit(input, purchase) : onSubmit(input));
      onDone();
    } catch (err) {
      setSubmitError(err instanceof Error && err.message ? err.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  const errorCount = Object.keys(errors).length;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle tabIndex={-1} className="outline-none">
          {editing ? "Edit want" : "New want"}
        </DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the details. Progress on dependencies is kept."
            : "Name it, price it, and choose three things to finish before it unlocks."}
        </DialogDescription>
      </DialogHeader>

      {summaryCount > 1 && errorCount > 0 && (
        <Notice>{summaryCount} fields need a quick look before saving.</Notice>
      )}

      <div className="grid gap-2">
        <Label htmlFor={fieldId("name")}>What do you want?</Label>
        <Input
          {...fieldProps("name")}
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearError("name");
          }}
          placeholder="e.g. Lagavulin 16"
          maxLength={LIMITS.name}
          autoComplete="off"
        />
        <FieldError id={errorId("name")} message={errors.name} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={fieldId("price")}>Price</Label>
        <PriceInput
          {...fieldProps("price", currencyId)}
          required
          currencyId={currencyId}
          value={price}
          onChange={(e) => {
            setPrice(e.target.value);
            clearError("price");
          }}
        />
        <FieldError id={errorId("price")} message={errors.price} />
      </div>

      <ImageField value={imageData} onChange={setImageData} onBusyChange={setImageBusy} />

      <div className="grid gap-2">
        <Label htmlFor={fieldId("category")}>
          Category <OptionalHint />
        </Label>
        <Input
          {...fieldProps("category")}
          list={categoryListId}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            clearError("category");
          }}
          placeholder="e.g. Treat"
          maxLength={LIMITS.category}
          autoComplete="off"
        />
        <datalist id={categoryListId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <FieldError id={errorId("category")} message={errors.category} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={fieldId("reason")}>
          Why you want it <OptionalHint />
        </Label>
        <Textarea
          {...fieldProps("reason")}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            clearError("reason");
          }}
          placeholder="What would it add to your life?"
          maxLength={LIMITS.reason}
          rows={3}
        />
        <FieldError id={errorId("reason")} message={errors.reason} />
      </div>

      <fieldset className="min-w-0">
        <legend className="mb-3">
          <span className="block font-serif text-lg leading-tight font-semibold">Three dependencies</span>
          <span className="mt-1 block text-sm text-muted-foreground">Finish all three to unlock this want.</span>
        </legend>
        <ol className="grid gap-3">
          {deps.map((dep, i) => {
            const [titleKey, descriptionKey] = DEP_KEYS[i];
            const done = want?.dependencies[i].completed ?? false;
            const doneId = `${uid}-${titleKey}-done`;
            return (
              <li key={titleKey} className="flex gap-3 rounded-2xl bg-muted/60 p-3">
                {/* The number is the visual label; the input carries the spoken one. */}
                <Label htmlFor={fieldId(titleKey)} className="h-11 shrink-0 self-start">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold text-muted-foreground tabular-nums",
                      done && "bg-unlock-soft text-unlock",
                    )}
                  >
                    {done ? <CheckIcon className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                </Label>
                <div className="grid min-w-0 flex-1 gap-2">
                  <Input
                    {...fieldProps(titleKey, done && doneId)}
                    aria-label={`Dependency ${i + 1}`}
                    required
                    value={dep.title}
                    onChange={(e) => updateDep(i, "title", e.target.value)}
                    placeholder={PLACEHOLDERS[i]}
                    maxLength={LIMITS.dependencyTitle}
                    autoComplete="off"
                  />
                  {done && (
                    <span id={doneId} className="sr-only">
                      Completed
                    </span>
                  )}
                  <FieldError id={errorId(titleKey)} message={errors[titleKey]} />
                  {revealed[i] ? (
                    <>
                      <Label htmlFor={fieldId(descriptionKey)} className="sr-only">
                        Dependency {i + 1} detail
                      </Label>
                      <Textarea
                        {...fieldProps(descriptionKey)}
                        value={dep.description}
                        onChange={(e) => updateDep(i, "description", e.target.value)}
                        placeholder="A little more detail (optional)"
                        maxLength={LIMITS.dependencyDescription}
                        rows={2}
                        className="min-h-16"
                      />
                      <FieldError id={errorId(descriptionKey)} message={errors[descriptionKey]} />
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => revealDescription(i)}
                      aria-label={`Add detail to dependency ${i + 1}`}
                      className="-ml-2 justify-self-start px-2 text-sm text-muted-foreground"
                    >
                      <PlusIcon aria-hidden />
                      Add detail
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </fieldset>

      {purchasedAt && (
        <fieldset className="grid min-w-0 gap-5">
          <legend className="mb-3 font-serif text-lg leading-tight font-semibold">Purchase details</legend>
          <div className="grid gap-2">
            <Label htmlFor={fieldId("purchaseDate")}>Purchase date</Label>
            <Input
              {...fieldProps("purchaseDate")}
              type="date"
              required
              max={today}
              value={purchaseDate}
              onChange={(e) => {
                setPurchaseDate(e.target.value);
                clearError("purchaseDate");
              }}
              className="sm:max-w-60 [&::-webkit-date-and-time-value]:text-left"
            />
            <FieldError id={errorId("purchaseDate")} message={errors.purchaseDate} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={fieldId("finalPrice")}>
              Final price <OptionalHint />
            </Label>
            <PriceInput
              {...fieldProps("finalPrice", finalCurrencyId, finalHintId)}
              currencyId={finalCurrencyId}
              value={finalPrice}
              onChange={(e) => {
                setFinalPrice(e.target.value);
                clearError("finalPrice");
              }}
            />
            <p id={finalHintId} className="text-[13px] leading-snug text-muted-foreground">
              What you actually paid, if it was different.
            </p>
            <FieldError id={errorId("finalPrice")} message={errors.finalPrice} />
          </div>
        </fieldset>
      )}

      {submitError && <Notice>{submitError}</Notice>}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost" size="lg">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" size="lg" disabled={saving || imageBusy} className="sm:min-w-36">
          {saving ? "Saving…" : editing ? "Save changes" : "Add want"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Decimal price input with a static CAD adornment that is also read as its description. */
function PriceInput({
  currencyId,
  className,
  ...props
}: ComponentProps<typeof Input> & { currencyId: string }) {
  return (
    <div className="relative sm:max-w-60">
      <Input
        inputMode="decimal"
        placeholder="0.00"
        autoComplete="off"
        className={cn("pr-16 tabular-nums", className)}
        {...props}
      />
      <span
        id={currencyId}
        className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-medium text-muted-foreground"
      >
        {CURRENCY}
      </span>
    </div>
  );
}

function OptionalHint() {
  return <span className="font-normal text-muted-foreground">(optional)</span>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm leading-snug text-destructive">
      {message}
    </p>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2.5 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
