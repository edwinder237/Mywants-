"use client";

import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { planMerge, type MergePlan } from "@/lib/backup";
import { cn } from "@/lib/utils";
import type { Want } from "@/lib/wants";

type Mode = "merge" | "replace";

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Validated wants from the chosen backup file. */
  incoming: Want[];
  fileName?: string;
  /** Wants currently on this device, for the preview. */
  existing: Want[];
  onMerge: (incoming: Want[]) => Promise<MergePlan>;
  onReplace: (incoming: Want[]) => Promise<void>;
  onCloseAutoFocus?: (event: Event) => void;
}

const wantsLabel = (n: number) => `${n} ${n === 1 ? "want" : "wants"}`;

/**
 * Confirms an import after the file has parsed. Remount (key) per file so the
 * choice resets to Merge.
 */
export function ImportDialog({
  open,
  onOpenChange,
  incoming,
  fileName,
  existing,
  onMerge,
  onReplace,
  onCloseAutoFocus,
}: ImportDialogProps) {
  const name = useId();
  const [mode, setMode] = useState<Mode>("merge");
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => planMerge(existing, incoming), [existing, incoming]);
  // With nothing on this device, merge and replace are the same thing.
  const hasExisting = existing.length > 0;
  const replacing = hasExisting && mode === "replace";

  async function confirm() {
    setBusy(true);
    try {
      if (replacing) {
        await onReplace(incoming);
        toast.success(`Replaced with ${wantsLabel(incoming.length)}.`);
      } else {
        const plan = await onMerge(incoming);
        if (plan.added + plan.updated === 0) toast("Nothing new to import. Everything here is up to date.");
        else toast.success(`Imported: ${plan.added} new, ${plan.updated} updated.`);
      }
      onOpenChange(false);
    } catch (err) {
      // The hook resyncs from storage on failure, so existing data stays as is.
      toast.error(err instanceof Error && err.message ? err.message : "Import failed. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Import {wantsLabel(incoming.length)}</DialogTitle>
          <DialogDescription>
            {fileName ? (
              <>
                From <span className="break-all text-foreground">{fileName}</span>.{" "}
              </>
            ) : null}
            {hasExisting ? "Choose how to bring them in." : "They'll be added to this device."}
          </DialogDescription>
        </DialogHeader>

        {hasExisting && (
          <div role="radiogroup" aria-label="How to import" className="flex flex-col gap-3">
            <Choice
              name={name}
              value="merge"
              checked={mode === "merge"}
              onSelect={() => setMode("merge")}
              title="Merge"
              description="Adds new wants and updates ones that changed. Keeps everything already here."
              detail={`${preview.added} new · ${preview.updated} updated · ${preview.unchanged} unchanged`}
            />
            <Choice
              name={name}
              value="replace"
              checked={mode === "replace"}
              onSelect={() => setMode("replace")}
              title="Replace"
              description={`Deletes the ${wantsLabel(existing.length)} on this device and replaces them with the file.`}
              detail="This can't be undone."
              destructive
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={replacing ? "destructive" : "default"} onClick={confirm} disabled={busy}>
            {!hasExisting ? "Import" : replacing ? "Replace everything" : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ChoiceProps {
  name: string;
  value: Mode;
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  detail: string;
  destructive?: boolean;
}

/** A large radio card: the whole card is the label; the native radio keeps arrow-key behaviour. */
function Choice({ name, value, checked, onSelect, title, description, detail, destructive = false }: ChoiceProps) {
  const id = useId();
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-2xl border bg-card p-4 transition-colors",
        "has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-popover",
        checked && (destructive ? "border-destructive bg-destructive/5" : "border-primary"),
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-desc`}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px]",
          checked ? (destructive ? "border-destructive" : "border-primary") : "border-muted-foreground/70",
        )}
      >
        <span
          className={cn(
            "size-2.5 rounded-full motion-safe:transition-transform",
            destructive ? "bg-destructive" : "bg-primary",
            checked ? "scale-100" : "scale-0",
          )}
        />
      </span>
      <span className="min-w-0">
        <span id={`${id}-title`} className={cn("block text-[15px] font-medium", destructive && "text-destructive")}>
          {title}
        </span>
        <span id={`${id}-desc`} className="mt-1 block text-sm leading-relaxed text-muted-foreground">
          {description}
          <span className="mt-2 block text-foreground tabular-nums">{detail}</span>
        </span>
      </span>
    </label>
  );
}
