import { CircleAlertIcon, PlusIcon, RotateCwIcon, SparklesIcon } from "lucide-react";

import { Tagline } from "@/components/brand";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  onAdd: () => void;
  onExample: () => void;
  /** When storage couldn't be opened, explain that instead of offering to add. */
  loadError?: string | null;
}

/** First run: no wants at all. */
export function EmptyState({ onAdd, onExample, loadError }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-2 pt-8 pb-6 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
      <Illustration />
      <Tagline as="h2" className="mt-7 font-serif text-[26px] leading-tight font-semibold tracking-tight" />
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
        Add something you&apos;d like to buy and choose three things to do first. When all three are done, it unlocks
        and you decide if it still feels right.
      </p>

      {loadError ? (
        <div
          role="alert"
          className="mt-8 flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-left"
        >
          <p className="flex items-start gap-2.5 text-[15px] leading-snug text-destructive">
            <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="block font-medium">Your wants couldn&apos;t be loaded.</span>
              <span className="mt-1 block text-sm">{loadError}</span>
            </span>
          </p>
          <Button variant="outline" onClick={() => window.location.reload()} className="self-start">
            <RotateCwIcon /> Try again
          </Button>
        </div>
      ) : (
        <div className="mt-8 flex w-full max-w-xs flex-col gap-2.5">
          <Button size="lg" onClick={onAdd}>
            <PlusIcon /> Add your first want
          </Button>
          <Button size="lg" variant="ghost" onClick={onExample}>
            <SparklesIcon /> Try an example
          </Button>
        </div>
      )}

      <p className="mt-6 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
        Everything stays on this device. No account, no cloud.
      </p>
    </div>
  );
}

/** A padlock waiting on its third step: two done, one to go. */
function Illustration() {
  return (
    <svg width="148" height="124" viewBox="0 0 148 124" fill="none" aria-hidden>
      <circle cx="74" cy="60" r="50" className="fill-unlock-soft" opacity="0.55" />
      <path
        d="M57 56V43a17 17 0 0 1 34 0v13"
        className="stroke-muted-foreground/55"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <rect x="42" y="52" width="64" height="48" rx="15" className="fill-card stroke-border" strokeWidth="1.5" />
      <circle cx="74" cy="72" r="5" className="fill-muted-foreground/55" />
      <rect x="72" y="74" width="4" height="11" rx="2" className="fill-muted-foreground/55" />
      <rect x="38" y="112" width="20" height="5" rx="2.5" className="fill-unlock" />
      <rect x="64" y="112" width="20" height="5" rx="2.5" className="fill-unlock" />
      <rect x="90" y="112" width="20" height="5" rx="2.5" className="fill-muted-foreground/20" />
      <path
        d="M117 18l2 5.2 5.2 2-5.2 2-2 5.2-2-5.2-5.2-2 5.2-2z"
        className="fill-unlock/70"
      />
    </svg>
  );
}
