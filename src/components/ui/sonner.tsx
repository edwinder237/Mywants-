"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      offset={{ top: "max(env(safe-area-inset-top), 12px)" }}
      mobileOffset={{ top: "max(env(safe-area-inset-top), 12px)" }}
      toastOptions={{
        classNames: {
          toast: "!rounded-2xl !border-border !bg-popover !text-popover-foreground !shadow-lg",
          description: "!text-muted-foreground",
          // Sonner's default action button is 24px tall; keep touch targets ≥ 44px.
          actionButton: "!h-11 !min-w-11 !rounded-xl !px-4 !text-sm !font-medium !bg-primary !text-primary-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
