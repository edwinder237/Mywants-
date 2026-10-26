"use client";

import { useId, type ReactNode } from "react";

import { LockState } from "@/components/lock-state";
import { ProgressSteps } from "@/components/progress-steps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WantThumb } from "@/components/want-thumb";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { completedCount, CURRENCY, getStatus, isDemo, type Want, type WantStatus } from "@/lib/wants";

export type CardAction = "open" | "decide" | "restore";

export interface WantCardProps {
  want: Want;
  onAction: (want: Want, action: CardAction) => void;
}

interface PrimaryAction {
  label: string;
  /** Joins the label to the want's name in the accessible name ("Decide on …"). */
  joiner: string;
  action: CardAction;
  variant: "secondary" | "unlock" | "outline";
}

const PRIMARY: Record<WantStatus, PrimaryAction> = {
  locked: { label: "Update progress", joiner: " on", action: "open", variant: "secondary" },
  unlocked: { label: "Decide", joiner: " on", action: "decide", variant: "unlock" },
  purchased: { label: "View", joiner: "", action: "open", variant: "outline" },
  archived: { label: "Restore", joiner: "", action: "restore", variant: "outline" },
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { dateStyle: "medium" });

function metaLine(want: Want, status: WantStatus): ReactNode {
  switch (status) {
    case "locked": {
      const next = want.dependencies.find((d) => !d.completed);
      return next ? (
        <>
          Next: <span className="text-foreground">{next.title}</span>
        </>
      ) : null;
    }
    case "unlocked":
      return <span className="text-unlock">Ready when you are.</span>;
    case "purchased":
      return want.purchasedAt
        ? `Bought ${formatDate(want.purchasedAt)}${
            want.finalPriceCents !== undefined ? ` · Paid ${formatPrice(want.finalPriceCents)}` : ""
          }`
        : null;
    case "archived":
      return want.archivedAt ? `Archived ${formatDate(want.archivedAt)}` : null;
  }
}

export function WantCard({ want, onAction }: WantCardProps) {
  const headingId = useId();
  const status = getStatus(want);
  const done = completedCount(want);
  const primary = PRIMARY[status];
  // Where the primary action already opens the details, the overlay is a
  // pointer-only convenience; otherwise it is a real, labelled control.
  const overlayIsDuplicate = primary.action === "open";

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        "relative rounded-3xl border bg-card p-4 shadow-[0_1px_2px_oklch(0.2_0.02_60/0.05)] transition-[border-color,box-shadow,scale] duration-200",
        "has-[[data-card-overlay]:hover]:shadow-md motion-safe:has-[[data-card-overlay]:active]:scale-[0.99]",
        status === "unlocked" && "border-unlock/40",
      )}
    >
      {/* Stretched target: tapping anywhere on the card opens its details. */}
      <button
        type="button"
        data-card-overlay=""
        onClick={() => onAction(want, "open")}
        aria-hidden={overlayIsDuplicate || undefined}
        tabIndex={overlayIsDuplicate ? -1 : undefined}
        aria-label={overlayIsDuplicate ? undefined : `View details for ${want.name}`}
        className="absolute inset-0 z-[1] rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />

      <div className="flex gap-3.5">
        <WantThumb want={want} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 id={headingId} className="min-w-0 truncate font-serif text-lg leading-snug font-semibold">
              {want.name}
            </h2>
            {isDemo(want) && (
              <Badge variant="example" className="shrink-0">
                Example
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[15px] tabular-nums">
            {formatPrice(want.priceCents)}{" "}
            <span className="text-xs tracking-wide text-muted-foreground">{CURRENCY}</span>
          </p>
          <LockState status={status} done={done} className="mt-2" />
        </div>
      </div>

      <ProgressSteps
        done={done}
        className={cn("mt-4", (status === "purchased" || status === "archived") && "opacity-60")}
      />

      <div className="mt-3 flex items-center gap-3">
        <p className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug [overflow-wrap:anywhere] text-muted-foreground">
          {metaLine(want, status)}
        </p>
        <Button
          type="button"
          variant={primary.variant}
          data-want-id={want.id}
          // Starts with the visible label (voice control), then says which want.
          aria-label={`${primary.label}${primary.joiner} ${want.name}`}
          onClick={() => onAction(want, primary.action)}
          className="relative z-10 shrink-0"
        >
          {primary.label}
        </Button>
      </div>
    </article>
  );
}
