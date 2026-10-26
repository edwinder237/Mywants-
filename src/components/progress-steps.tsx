import { cn } from "@/lib/utils";
import { DEPENDENCY_COUNT } from "@/lib/wants";

/** Three-segment progress bar: one segment per dependency. */
export function ProgressSteps({ done, className }: { done: number; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={DEPENDENCY_COUNT}
      aria-valuenow={done}
      aria-label={`${done} of ${DEPENDENCY_COUNT} dependencies done`}
      className={cn("flex gap-1.5", className)}
    >
      {Array.from({ length: DEPENDENCY_COUNT }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors duration-500",
            i < done ? "bg-unlock" : "bg-muted-foreground/15",
          )}
        />
      ))}
    </div>
  );
}
