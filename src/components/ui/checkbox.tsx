"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-6 shrink-0 rounded-full border-[1.5px] border-muted-foreground/80 bg-card transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60",
        "data-[state=checked]:border-unlock data-[state=checked]:bg-unlock data-[state=checked]:text-unlock-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center animate-in zoom-in-50 duration-150">
        <CheckIcon className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
