import { cn } from "@/lib/utils";
import type { Want } from "@/lib/wants";

export interface WantThumbProps {
  want: Pick<Want, "name" | "imageData">;
  /** sm: 64px square for cards. lg: wide photo at the top of the detail sheet (nothing without an image). */
  size?: "sm" | "lg";
  className?: string;
}

/** Decorative image or letter tile; the want's name is always shown next to it. */
export function WantThumb({ want, size = "sm", className }: WantThumbProps) {
  if (size === "lg") {
    if (!want.imageData) return null;
    return (
      // Local data URL in a static export, so next/image adds nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={want.imageData}
        alt=""
        decoding="async"
        className={cn("aspect-[4/3] max-h-[260px] w-full rounded-3xl bg-secondary object-cover", className)}
      />
    );
  }

  if (want.imageData) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={want.imageData}
        alt=""
        decoding="async"
        className={cn("size-16 shrink-0 rounded-2xl bg-secondary object-cover", className)}
      />
    );
  }

  const initial = Array.from(want.name.trim())[0]?.toLocaleUpperCase() ?? "";
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-16 shrink-0 items-center justify-center rounded-2xl bg-secondary font-serif text-2xl font-semibold text-muted-foreground select-none",
        className,
      )}
    >
      {initial}
    </div>
  );
}
