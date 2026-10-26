import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type TextTag = "h1" | "h2" | "p" | "span";

export const TAGLINE = "Want it. Earn it. Enjoy it.";

/** Wordmark "my wants.": lowercase serif with the period in the unlock colour. */
export function Brand({ as: Tag = "h1", className, ...props }: HTMLAttributes<HTMLElement> & { as?: TextTag }) {
  return (
    <Tag className={cn("font-serif text-[28px] leading-none font-semibold tracking-tight", className)} {...props}>
      my wants<span className="text-unlock">.</span>
    </Tag>
  );
}

/** "Want it. Earn it. Enjoy it." Unstyled so each place can size it. */
export function Tagline({ as: Tag = "p", ...props }: HTMLAttributes<HTMLElement> & { as?: TextTag }) {
  return <Tag {...props}>{TAGLINE}</Tag>;
}
