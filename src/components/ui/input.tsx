import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // 16px text stops iOS Safari zooming into focused inputs.
        "h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground/70 disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
