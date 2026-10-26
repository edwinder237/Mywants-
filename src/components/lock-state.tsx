import { ArchiveIcon, LockIcon, LockOpenIcon, ShoppingBagIcon, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { DEPENDENCY_COUNT, type WantStatus } from "@/lib/wants";

export interface LockStateProps {
  status: WantStatus;
  done: number;
  /** One-shot unlock moment: shackle opens, pill pops and glows. */
  celebrate?: boolean;
  className?: string;
}

// Each pairing keeps text at WCAG AA (≥ 4.5:1) in both themes.
const STYLES: Record<WantStatus, { icon: LucideIcon; tone: string }> = {
  locked: { icon: LockIcon, tone: "bg-secondary text-muted-foreground" },
  unlocked: { icon: LockOpenIcon, tone: "bg-unlock-soft text-unlock" },
  purchased: { icon: ShoppingBagIcon, tone: "bg-primary/8 text-foreground" },
  archived: { icon: ArchiveIcon, tone: "border border-border text-muted-foreground" },
};

/** Status pill with icon + text, e.g. "Locked · 1 of 3" or "Unlocked". */
export function LockState({ status, done, celebrate = false, className }: LockStateProps) {
  const { icon: Icon, tone } = STYLES[status];
  const party = celebrate && status === "unlocked";

  return (
    // Pop and glow both use `animation`, so they live on separate elements.
    <span className={cn("inline-flex w-fit rounded-full", party && "motion-safe:animate-unlock-pop", className)}>
      <span
        data-status={status}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] leading-none font-medium whitespace-nowrap tabular-nums",
          tone,
          party && "motion-safe:animate-unlock-glow",
        )}
      >
        <Icon
          aria-hidden
          className={cn("size-3.5 shrink-0", party && "origin-bottom-right motion-safe:animate-shackle-open")}
        />
        {status === "locked" && `Locked · ${Math.min(done, DEPENDENCY_COUNT)} of ${DEPENDENCY_COUNT}`}
        {status === "unlocked" && "Unlocked"}
        {status === "purchased" && "Purchased"}
        {status === "archived" && "Archived"}
      </span>
    </span>
  );
}
