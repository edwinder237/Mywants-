import { cn } from "@/lib/utils";
import { DEPENDENCY_COUNT } from "@/lib/wants";

export interface ProgressStepsProps {
  done: number;
  /** Play the fill animation on the newest filled segment (the unlock moment). */
  animateFill?: boolean;
  className?: string;
}

/** Three-segment progress bar: one segment per dependency. */
export function ProgressSteps({ done, animateFill = false, className }: ProgressStepsProps) {
  const filledCount = Math.max(0, Math.min(DEPENDENCY_COUNT, Math.floor(done)));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={DEPENDENCY_COUNT}
      aria-valuenow={filledCount}
      aria-label={`${filledCount} of ${DEPENDENCY_COUNT} dependencies done`}
      className={cn("flex gap-1.5", className)}
    >
      {Array.from({ length: DEPENDENCY_COUNT }, (_, i) => {
        const filled = i < filledCount;
        const newest = animateFill && filled && i === filledCount - 1;
        return (
          <span
            key={i}
            data-filled={filled ? "" : undefined}
            className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted-foreground/20"
          >
            <span
              className={cn(
                "absolute inset-0 origin-left rounded-full bg-unlock ease-out motion-safe:transition-transform motion-safe:duration-300",
                filled ? "scale-x-100" : "scale-x-0",
                newest && "motion-safe:animate-segment-fill",
              )}
            />
          </span>
        );
      })}
    </div>
  );
}
