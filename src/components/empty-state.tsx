import { PlusIcon, SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Shown when there are no wants at all. */
export function EmptyState({ onAdd, onSample }: { onAdd: () => void; onSample: () => void }) {
  return (
    <div className="flex flex-col items-center px-4 pt-10 pb-6 text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
      <Illustration />
      <h2 className="mt-8 font-serif text-2xl font-semibold tracking-tight">Earn the things you want</h2>
      <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-muted-foreground">
        Add something you&apos;d like to buy and pick three things to finish first. It unlocks when all three are done.
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-2.5">
        <Button size="lg" onClick={onAdd}>
          <PlusIcon /> Add your first want
        </Button>
        <Button size="lg" variant="ghost" onClick={onSample}>
          <SparklesIcon /> Try a sample want
        </Button>
      </div>
      <p className="mt-6 max-w-xs text-xs leading-relaxed text-muted-foreground">
        Everything stays on this device. No account, no cloud.
      </p>
    </div>
  );
}

/** Small padlock with three steps: two done, one to go. */
function Illustration() {
  return (
    <svg width="132" height="108" viewBox="0 0 132 108" fill="none" aria-hidden className="text-foreground">
      <rect x="10" y="22" width="112" height="78" rx="22" className="fill-card stroke-border" strokeWidth="1.5" />
      <path
        d="M50 50V40a16 16 0 0 1 32 0v10"
        className="stroke-muted-foreground/50"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <rect x="40" y="48" width="52" height="34" rx="10" className="fill-secondary stroke-border" strokeWidth="1.5" />
      <circle cx="66" cy="63" r="4" className="fill-muted-foreground/50" />
      <rect x="64.5" y="64" width="3" height="8" rx="1.5" className="fill-muted-foreground/50" />
      <rect x="30" y="89" width="20" height="4" rx="2" className="fill-unlock" />
      <rect x="56" y="89" width="20" height="4" rx="2" className="fill-unlock" />
      <rect x="82" y="89" width="20" height="4" rx="2" className="fill-muted-foreground/20" />
    </svg>
  );
}
