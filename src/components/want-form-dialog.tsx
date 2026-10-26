"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCIES, DEFAULT_CURRENCY, centsToInput, parsePriceToCents } from "@/lib/money";
import { validateInput, type Want, type WantInput } from "@/lib/wants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the form edits this want; otherwise it creates one. */
  want?: Want | null;
  onSubmit: (input: WantInput) => Promise<unknown>;
}

const PLACEHOLDERS = ["e.g. Run 3 times this week", "e.g. Finish the report", "e.g. Cook at home 5 nights"];

export function WantFormDialog({ open, onOpenChange, want, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed so the fields reset each time the sheet opens. */}
        {open && <WantForm key={want?.id ?? "new"} want={want} onSubmit={onSubmit} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function WantForm({
  want,
  onSubmit,
  onDone,
}: {
  want?: Want | null;
  onSubmit: Props["onSubmit"];
  onDone: () => void;
}) {
  const editing = Boolean(want);
  const frozen = Boolean(want?.purchasedAt);
  const [title, setTitle] = useState(want?.title ?? "");
  const [price, setPrice] = useState(want ? centsToInput(want.priceCents) : "");
  const [currency, setCurrency] = useState(want?.currency ?? DEFAULT_CURRENCY);
  const [deps, setDeps] = useState<[string, string, string]>(
    want ? [want.dependencies[0].title, want.dependencies[1].title, want.dependencies[2].title] : ["", "", ""],
  );
  const [url, setUrl] = useState(want?.url ?? "");
  const [note, setNote] = useState(want?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const currencies: string[] = CURRENCIES.includes(currency as (typeof CURRENCIES)[number])
    ? [...CURRENCIES]
    : [currency, ...CURRENCIES];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceCents = parsePriceToCents(price);
    if (priceCents === null) {
      setError("Enter a valid price, like 143.84.");
      return;
    }
    const input: WantInput = { title, priceCents, currency, url, note, dependencyTitles: deps };
    const errors = validateInput(input);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(input);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit want" : "New want"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Change the details. Completed dependencies stay completed."
            : "Choose three things to finish before this unlocks."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="want-title">What do you want?</Label>
        <Input
          id="want-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Lagavulin 16"
          maxLength={200}
          autoComplete="off"
          enterKeyHint="next"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="want-price">Price</Label>
        <div className="flex gap-2">
          <Input
            id="want-price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="flex-1 tabular-nums"
            autoComplete="off"
          />
          <select
            aria-label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-11 rounded-xl border border-input bg-card px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="grid gap-2.5" disabled={frozen}>
        <legend className="mb-2.5 text-sm font-medium">
          Three dependencies
          {frozen && <span className="ml-1 font-normal text-muted-foreground">· frozen after purchase</span>}
        </legend>
        {deps.map((value, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold tabular-nums text-muted-foreground"
            >
              {i + 1}
            </span>
            <Input
              aria-label={`Dependency ${i + 1}`}
              value={value}
              maxLength={200}
              autoComplete="off"
              placeholder={PLACEHOLDERS[i]}
              onChange={(e) => {
                const next = [...deps] as [string, string, string];
                next[i] = e.target.value;
                setDeps(next);
              }}
            />
          </div>
        ))}
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="want-url">
          Link <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="want-url"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          autoComplete="off"
          autoCapitalize="none"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="want-note">
          Note <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea id="want-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" size="lg" disabled={saving} className="w-full sm:w-auto">
          {editing ? "Save changes" : "Add want"}
        </Button>
      </DialogFooter>
    </form>
  );
}
