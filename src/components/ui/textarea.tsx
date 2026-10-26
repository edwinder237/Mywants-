import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
