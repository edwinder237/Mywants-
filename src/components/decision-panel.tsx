"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from "react";
import { ArchiveIcon, ArrowLeftIcon, ShoppingBagIcon } from "lucide-react";

import { LockState } from "@/components/lock-state";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToInput, formatPrice, parsePriceToCents } from "@/lib/money";
import { CURRENCY, DEPENDENCY_COUNT, LIMITS, type PurchaseInput, type Want } from "@/lib/wants";

export interface DecisionPanelProps {
  want: Want;
  /** Gets the view heading (the dialog title) so the dialog can move focus to it. */
  titleRef?: Ref<HTMLHeadingElement>;
  /** Resolves true on success. */
  onPurchase: (input: PurchaseInput) => Promise<boolean>;
  /** Resolves true on success. */
  onArchive: () => Promise<boolean>;
  /** Close the sheet: "Not now", or after a purchase/archive succeeds. */
  onClose: () => void;
  onBack: () => void;
}

/** "YYYY-MM-DD" for the local calendar day, the format <input type="date"> uses. */
function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local noon on the picked day, so the stored date stays on that day across time zones. */
function fromDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, 12);
  // Round-trip check rejects impossible dates and two-digit years (Date maps 0–99 to 19xx).
  return year >= 1970 && toDateInputValue(date) === value ? date : null;
}

async function settle(action: () => Promise<boolean>): Promise<boolean> {
  try {
    return await action();
  } catch {
    // The parent reports failures; treat a stray throw as "not done".
    return false;
  }
}

type Errors = { date?: string; price?: string };

/**
 * The unlock decision (PROJECT.md §3.6): two questions, then purchase, defer
 * or archive. Only rendered for unlocked wants, inside the detail dialog.
 */
export function DecisionPanel({ want, titleRef, onPurchase, onArchive, onClose, onBack }: DecisionPanelProps) {
  const [step, setStep] = useState<"choose" | "confirm">("choose");
  const [today] = useState(() => toDateInputValue(new Date()));
  const [date, setDate] = useState(today);
  const [price, setPrice] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const ids = useId();
  const dateId = `${ids}-date`;
  const priceId = `${ids}-price`;
  const confirmHeadingId = `${ids}-confirm`;

  const purchaseButtonRef = useRef<HTMLButtonElement>(null);
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const focusAfterStep = useRef(false);

  // Keep keyboard and screen reader users oriented when the step swaps in place.
  useEffect(() => {
    if (!focusAfterStep.current) return;
    focusAfterStep.current = false;
    if (step === "confirm") {
      const heading = confirmHeadingRef.current;
      heading?.focus({ preventScroll: true });
      // Bring the whole confirmation (fields and button) into view, not just its heading.
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      heading?.closest("form")?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }
    else purchaseButtonRef.current?.focus();
  }, [step]);

  function goTo(next: "choose" | "confirm") {
    focusAfterStep.current = true;
    setErrors({});
    setStep(next);
  }

  async function archive() {
    if (busy) return;
    setBusy(true);
    if (await settle(() => onArchive())) onClose();
    else setBusy(false);
  }

  async function confirmPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const next: Errors = {};
    const purchasedAt = fromDateInputValue(date);
    if (!date) next.date = "Choose the day you bought it.";
    else if (!purchasedAt) next.date = "Enter a valid date.";
    else if (date > toDateInputValue(new Date())) next.date = "The purchase date can't be in the future.";

    let finalPriceCents: number | undefined;
    if (price.trim() !== "") {
      const cents = parsePriceToCents(price);
      if (cents === null || cents > LIMITS.priceCents) next.price = "Enter a price like 129.99, or leave it blank.";
      else finalPriceCents = cents;
    }

    setErrors(next);
    if (next.date || !purchasedAt) {
      dateRef.current?.focus();
      return;
    }
    if (next.price) {
      priceRef.current?.focus();
      return;
    }

    const input: PurchaseInput = { purchasedAt };
    if (finalPriceCents !== undefined) input.finalPriceCents = finalPriceCents;

    setBusy(true);
    if (await settle(() => onPurchase(input))) onClose();
    else setBusy(false);
  }

  const listed = formatPrice(want.priceCents);
  const dateErrorId = `${dateId}-error`;
  const priceHintId = `${priceId}-hint`;
  const priceErrorId = `${priceId}-error`;

  return (
    <>
      <Button variant="ghost" onClick={onBack} className="-mt-2 -ml-3 self-start px-3 text-muted-foreground">
        <ArrowLeftIcon /> Back to details
      </Button>

      <DialogHeader className="-mt-2 gap-2 pr-0">
        <LockState status="unlocked" done={DEPENDENCY_COUNT} />
        <DialogTitle ref={titleRef} tabIndex={-1} className="break-words outline-none">
          {want.name} is unlocked
        </DialogTitle>
        <DialogDescription>
          Listed at <span className="text-foreground/80 tabular-nums">{listed}</span> {CURRENCY}. Take a moment with
          these two questions. There&apos;s no rush.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col divide-y rounded-2xl border bg-card">
        <section className="px-4 py-3.5">
          <h3 className="font-serif text-lg leading-snug font-semibold">Do you still want it?</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            It&apos;s fine if the answer has changed since you added it.
          </p>
        </section>
        <section className="px-4 py-3.5">
          <h3 className="font-serif text-lg leading-snug font-semibold">
            Can you comfortably afford it without adding unwanted debt?
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Think about the money you have now, not what you expect later.
          </p>
        </section>
      </div>

      {step === "choose" ? (
        <div className="flex flex-col gap-2" aria-busy={busy || undefined}>
          {/* Equal weight: unlocking is permission to reconsider, not a nudge to buy. */}
          <Button ref={purchaseButtonRef} variant="outline" size="lg" onClick={() => goTo("confirm")}>
            <ShoppingBagIcon /> Mark purchased
          </Button>
          <Button variant="outline" size="lg" onClick={onClose}>
            Not now
          </Button>
          <Button variant="outline" size="lg" onClick={archive}>
            <ArchiveIcon /> Archive instead
          </Button>
          <p className="pt-1 text-center text-sm text-muted-foreground">
            &ldquo;Not now&rdquo; keeps it unlocked so you can decide later.
          </p>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={confirmPurchase}
          aria-labelledby={confirmHeadingId}
          aria-busy={busy || undefined}
          className="flex flex-col gap-4 rounded-2xl border bg-card p-4"
        >
          <div>
            <h3
              id={confirmHeadingId}
              ref={confirmHeadingRef}
              tabIndex={-1}
              className="font-serif text-lg leading-snug font-semibold outline-none"
            >
              Confirm purchase
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              This moves it to Purchased. No payment happens in the app.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={dateId}>Purchase date</Label>
            <Input
              ref={dateRef}
              id={dateId}
              type="date"
              required
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={errors.date ? true : undefined}
              aria-describedby={errors.date ? dateErrorId : undefined}
              className="tabular-nums [&::-webkit-date-and-time-value]:text-left"
            />
            {errors.date && (
              <p id={dateErrorId} className="text-sm text-destructive">
                {errors.date}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={priceId}>
              Final price <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <div className="relative">
              <Input
                ref={priceRef}
                id={priceId}
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                placeholder={centsToInput(want.priceCents)}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={errors.price ? true : undefined}
                aria-describedby={errors.price ? `${priceHintId} ${priceErrorId}` : priceHintId}
                className="pr-14 tabular-nums"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-muted-foreground"
              >
                {CURRENCY}
              </span>
            </div>
            <p id={priceHintId} className="text-sm text-muted-foreground">
              In {CURRENCY}. Leave blank if you paid the listed {listed}.
            </p>
            {errors.price && (
              <p id={priceErrorId} className="text-sm text-destructive">
                {errors.price}
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => goTo("choose")}>
              Cancel
            </Button>
            <Button type="submit" variant="unlock">
              <ShoppingBagIcon /> Confirm purchase
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
