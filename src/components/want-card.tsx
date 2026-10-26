"use client";

import { ChevronRightIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ProgressSteps } from "@/components/progress-steps";
import { StatusBadge } from "@/components/status-badge";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { completedCount, getStatus, type Want } from "@/lib/wants";

export function WantCard({ want, onOpen }: { want: Want; onOpen: () => void }) {
  const done = completedCount(want);
  const status = getStatus(want);
  const next = want.dependencies.find((d) => !d.completedAt);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group w-full rounded-3xl border bg-card p-4 text-left shadow-[0_1px_2px_oklch(0.2_0.02_60/0.05)] transition-[transform,box-shadow,border-color] duration-200 active:scale-[0.99] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        status === "unlocked" && "border-unlock/35",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={status} done={done} />
            {want.isSample && <Badge variant="sample">Sample</Badge>}
          </div>
          <h3 className="mt-2 truncate font-serif text-lg leading-snug font-semibold">{want.title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
            {formatPrice(want.priceCents, want.currency)}{" "}
            <span className="text-xs tracking-wide">{want.currency}</span>
          </p>
        </div>
        <ChevronRightIcon className="mt-1 size-5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
      </div>

      {status !== "purchased" && (
        <div className="mt-4">
          <ProgressSteps done={done} />
          <p className="mt-2 truncate text-[13px] text-muted-foreground">
            {next ? (
              <>
                Next: <span className="text-foreground">{next.title}</span>
              </>
            ) : (
              "All three done. Decide if it fits your budget."
            )}
          </p>
        </div>
      )}
      {status === "purchased" && want.purchasedAt && (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Bought {new Date(want.purchasedAt).toLocaleDateString("en-CA", { dateStyle: "medium" })}
        </p>
      )}
    </button>
  );
}
