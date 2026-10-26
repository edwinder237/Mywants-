import { CheckIcon, LockIcon, LockOpenIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { WantStatus } from "@/lib/wants";

export function StatusBadge({ status, done }: { status: WantStatus; done: number }) {
  if (status === "purchased") {
    return (
      <Badge variant="purchased">
        <CheckIcon /> Purchased
      </Badge>
    );
  }
  if (status === "unlocked") {
    return (
      <Badge variant="unlock" className="animate-in fade-in zoom-in-90 duration-300">
        <LockOpenIcon /> Unlocked
      </Badge>
    );
  }
  return (
    <Badge>
      <LockIcon /> {done} of 3
    </Badge>
  );
}
