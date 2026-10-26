"use client";

import { useEffect, useId, useRef, useState, type Ref, type RefObject } from "react";
import { ArchiveIcon, ArchiveRestoreIcon, LockIcon, LockOpenIcon, PencilIcon, ShoppingBagIcon, Trash2Icon } from "lucide-react";

import { DecisionPanel } from "@/components/decision-panel";
import { LockState } from "@/components/lock-state";
import { ProgressSteps } from "@/components/progress-steps";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WantThumb } from "@/components/want-thumb";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  completedCount,
  CURRENCY,
  DEPENDENCY_COUNT,
  getStatus,
  isDemo,
  type PurchaseInput,
  type Want,
  type WantStatus,
} from "@/lib/wants";

export type DetailView = "detail" | "decide";

export interface WantDetailDialogProps {
  /** Open when non-null. Always the latest copy from state. */
  want: Want | null;
  /** Which view to show when it opens (card "Decide" opens "decide"). */
  initialView?: DetailView;
  onOpenChange: (open: boolean) => void;
  /** Each returns true on success; the parent shows toasts and error toasts. */
  onToggle: (dependencyId: string) => Promise<boolean>;
  onPurchase: (input: PurchaseInput) => Promise<boolean>;
  /** `undo: false` when the sheet stays open (its Restore button replaces a toast Undo). */
  onArchive: (options?: { undo?: boolean }) => Promise<boolean>;
  onRestore: () => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onEdit: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { dateStyle: "medium" });

async function settle(action: () => Promise<boolean>): Promise<boolean> {
  try {
    return await action();
  } catch {
    // The parent reports failures; treat a stray throw as "not done".
    return false;
  }
}

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function WantDetailDialog({
  want,
  initialView = "detail",
  onOpenChange,
  onToggle,
  onPurchase,
  onArchive,
  onRestore,
  onDelete,
  onEdit,
  onCloseAutoFocus,
}: WantDetailDialogProps) {
  const id = want?.id ?? null;
  const status = want ? getStatus(want) : null;

  // Last open want, so the sheet keeps its content while it animates closed.
  const [shown, setShown] = useState<Want | null>(want);
  // Previous status of the open want: a locked → unlocked change while open is the unlock moment.
  const [tracked, setTracked] = useState<{ id: string | null; status: WantStatus | null }>({ id, status });
  const [view, setView] = useState<DetailView>(initialView);
  /** Increments on each unlock moment; 0 means nothing to celebrate. */
  const [celebration, setCelebration] = useState(0);

  // Adjust state during render when the open want or its status changes.
  if (want && want !== shown) setShown(want);
  if (id !== tracked.id || status !== tracked.status) {
    setTracked({ id, status });
    if (id !== null) {
      // Only the third dependency completing while open celebrates; opening an
      // unlocked want or restoring one never does.
      const unlockedNow = id === tracked.id && tracked.status === "locked" && status === "unlocked";
      setCelebration(unlockedNow ? (n) => n + 1 : 0);
      if (id !== tracked.id) setView(initialView);
      else if (status !== "unlocked" && view === "decide") setView("detail");
    }
  }

  const display = want ?? shown;
  const displayStatus = display ? getStatus(display) : null;
  const activeView: DetailView = view === "decide" && displayStatus === "unlocked" ? "decide" : "detail";
  const celebrate = celebration > 0 && activeView === "detail" && displayStatus === "unlocked";

  const titleRef = useRef<HTMLHeadingElement>(null);
  const unlockPanelRef = useRef<HTMLElement>(null);
  const unlockHeadingRef = useRef<HTMLHeadingElement>(null);

  // The unlock moment: bring the decision prompt into view and announce it.
  useEffect(() => {
    if (celebration === 0) return;
    unlockPanelRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "nearest" });
    unlockHeadingRef.current?.focus({ preventScroll: true });
  }, [celebration]);

  // Moving between views (while open) puts focus on the new view's heading.
  const openView = want ? activeView : null;
  const lastOpenView = useRef<DetailView | null>(null);
  useEffect(() => {
    const previous = lastOpenView.current;
    lastOpenView.current = openView;
    if (previous && openView && previous !== openView) {
      // Start the new view at the top; the sheet keeps its scroll position otherwise.
      titleRef.current?.closest<HTMLElement>('[data-slot="dialog-content"]')?.scrollTo?.({ top: 0 });
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [openView]);

  function switchView(next: DetailView) {
    setCelebration(0);
    setView(next);
  }

  const close = () => onOpenChange(false);

  return (
    <Dialog open={want !== null} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          // Start at the top (the title) instead of the first checkbox.
          event.preventDefault();
          titleRef.current?.focus();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        className={cn(
          // The close button floats over the photo, so give it a surface.
          activeView === "detail" &&
            display?.imageData &&
            "[&>[data-slot=dialog-close]]:bg-popover/85 [&>[data-slot=dialog-close]]:shadow-sm [&>[data-slot=dialog-close]]:backdrop-blur-sm",
        )}
      >
        {display &&
          (activeView === "decide" ? (
            <DecisionPanel
              key={display.id}
              want={display}
              titleRef={titleRef}
              onPurchase={onPurchase}
              onArchive={onArchive}
              onClose={close}
              onBack={() => switchView("detail")}
            />
          ) : (
            <WantDetails
              key={display.id}
              want={display}
              celebrate={celebrate}
              titleRef={titleRef}
              unlockPanelRef={unlockPanelRef}
              unlockHeadingRef={unlockHeadingRef}
              onToggle={onToggle}
              onArchive={onArchive}
              onRestore={onRestore}
              onDelete={onDelete}
              onEdit={onEdit}
              onDecide={() => switchView("decide")}
              onClose={close}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}

interface WantDetailsProps {
  want: Want;
  celebrate: boolean;
  titleRef: RefObject<HTMLHeadingElement | null>;
  unlockPanelRef: Ref<HTMLElement>;
  unlockHeadingRef: Ref<HTMLHeadingElement>;
  onToggle: (dependencyId: string) => Promise<boolean>;
  /** `undo: false` when the sheet stays open (its Restore button replaces a toast Undo). */
  onArchive: (options?: { undo?: boolean }) => Promise<boolean>;
  onRestore: () => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onEdit: () => void;
  onDecide: () => void;
  onClose: () => void;
}

function WantDetails({
  want,
  celebrate,
  titleRef,
  unlockPanelRef,
  unlockHeadingRef,
  onToggle,
  onArchive,
  onRestore,
  onDelete,
  onEdit,
  onDecide,
  onClose,
}: WantDetailsProps) {
  const status = getStatus(want);
  const done = completedCount(want);
  const remaining = DEPENDENCY_COUNT - done;
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const ids = useId();

  const paid = want.finalPriceCents;
  const paidDiffers = status === "purchased" && paid !== undefined && paid !== want.priceCents;

  async function run(action: () => Promise<boolean>, after: (ok: boolean) => void) {
    if (busy) return;
    setBusy(true);
    const ok = await settle(action);
    setBusy(false);
    after(ok);
  }

  // The button that was pressed disappears with the status change, so keep focus in the sheet.
  const archive = () => run(() => onArchive({ undo: false }), (ok) => ok && titleRef.current?.focus());
  const restore = () => run(onRestore, (ok) => ok && titleRef.current?.focus());
  const remove = () => run(onDelete, (ok) => ok && onClose());

  return (
    <>
      <WantThumb want={want} size="lg" />

      {/* Below a photo the header no longer shares a row with the close button. */}
      <DialogHeader className={cn("gap-2", want.imageData && "pr-0")}>
        <div className="flex flex-wrap items-center gap-1.5">
          <LockState status={status} done={done} celebrate={celebrate} />
          {isDemo(want) && <Badge variant="example">Example</Badge>}
        </div>
        <DialogTitle ref={titleRef} tabIndex={-1} className="break-words outline-none">
          {want.name}
        </DialogTitle>
        <DialogDescription className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-base text-foreground/80 tabular-nums">
          {paidDiffers ? (
            <>
              <span>
                Paid {formatPrice(paid)} <span className="text-sm text-muted-foreground">{CURRENCY}</span>
              </span>
              <span className="text-sm text-muted-foreground">Listed {formatPrice(want.priceCents)}</span>
            </>
          ) : (
            <span>
              {formatPrice(want.priceCents)} <span className="text-sm text-muted-foreground">{CURRENCY}</span>
            </span>
          )}
          {want.category && (
            <span className="min-w-0 text-sm break-words text-muted-foreground">
              <span aria-hidden>· </span>
              <span className="sr-only">Category: </span>
              {want.category}
            </span>
          )}
        </DialogDescription>
      </DialogHeader>

      {want.reason && (
        <p className="-mt-1 border-l-2 border-border pl-3 text-[15px] leading-relaxed break-words whitespace-pre-line text-foreground/80">
          {want.reason}
        </p>
      )}

      <section aria-labelledby={`${ids}-deps`} className="flex flex-col">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={`${ids}-deps`} className="text-sm font-medium">
            Dependencies
          </h3>
          <span className="text-sm text-muted-foreground tabular-nums">
            {done} of {DEPENDENCY_COUNT} done
          </span>
        </div>
        <ProgressSteps done={done} animateFill={celebrate} className="mt-2.5" />
        <ul className="mt-3 flex flex-col overflow-hidden rounded-2xl border bg-card">
          {want.dependencies.map((dep) => {
            const titleId = `${ids}-${dep.id}-title`;
            const descId = `${ids}-${dep.id}-desc`;
            const doneId = `${ids}-${dep.id}-done`;
            const describedBy = [dep.description && descId, dep.completedAt && doneId].filter(Boolean).join(" ");
            return (
              <li key={dep.id} className="border-b last:border-b-0">
                <label className="flex min-h-14 cursor-pointer items-start gap-3.5 px-4 py-3.5 transition-colors select-none active:bg-accent/70">
                  <Checkbox
                    checked={dep.completed}
                    onCheckedChange={() => void onToggle(dep.id)}
                    aria-labelledby={titleId}
                    aria-describedby={describedBy || undefined}
                    className="mt-px"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      id={titleId}
                      className={cn(
                        "block text-[15px] leading-snug break-words transition-colors",
                        dep.completed && "text-muted-foreground line-through decoration-muted-foreground/50",
                      )}
                    >
                      {dep.title}
                    </span>
                    {dep.description && (
                      <span
                        id={descId}
                        className="mt-0.5 block text-sm leading-snug break-words whitespace-pre-line text-muted-foreground"
                      >
                        {dep.description}
                      </span>
                    )}
                    {dep.completed && dep.completedAt && (
                      <span id={doneId} className="mt-1 block text-xs text-muted-foreground">
                        Done {formatDate(dep.completedAt)}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {(status === "purchased" || status === "archived") && (
          <p className="mt-2 px-1 text-sm text-muted-foreground">
            You can still update these. It stays {status === "purchased" ? "purchased" : "archived"}.
          </p>
        )}
      </section>

      {status === "locked" && (
        <div className="flex items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-3.5 text-[15px] text-muted-foreground">
          <LockIcon aria-hidden className="size-4 shrink-0" />
          <p>{remaining} more to unlock.</p>
        </div>
      )}

      {status === "unlocked" && (
        <section
          ref={unlockPanelRef}
          aria-labelledby={`${ids}-unlocked`}
          className={cn(
            "flex scroll-my-4 flex-col gap-3 rounded-2xl bg-unlock-soft p-4",
            celebrate && "motion-safe:animate-unlock-pop",
          )}
        >
          <h3
            id={`${ids}-unlocked`}
            ref={unlockHeadingRef}
            tabIndex={-1}
            className="flex items-center gap-2 font-serif text-lg leading-snug font-semibold text-unlock outline-none"
          >
            <LockOpenIcon
              aria-hidden
              className={cn("size-4 shrink-0 origin-bottom-right", celebrate && "motion-safe:animate-shackle-open")}
            />
            Unlocked. Time to decide.
          </h3>
          <ul className="flex flex-col gap-1.5 text-[15px] leading-snug">
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-unlock" />
              Do you still want it?
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-unlock" />
              Can you comfortably afford it without adding unwanted debt?
            </li>
          </ul>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Unlocking means you can reconsider buying it — it isn&apos;t a sign you can afford it.
          </p>
          <Button variant="unlock" size="lg" onClick={onDecide} className="mt-1">
            Decide
          </Button>
        </section>
      )}

      {status === "archived" && want.archivedAt && (
        <div className="flex flex-col gap-3 rounded-2xl bg-secondary/70 p-4">
          <p className="flex items-center gap-3 text-[15px] text-muted-foreground">
            <ArchiveIcon aria-hidden className="size-4 shrink-0" />
            Archived {formatDate(want.archivedAt)}.
          </p>
          <Button onClick={restore}>
            <ArchiveRestoreIcon /> Restore
          </Button>
        </div>
      )}

      {status === "purchased" && want.purchasedAt && (
        <div className="flex items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-3.5 text-[15px]">
          <ShoppingBagIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <p>
            Purchased {formatDate(want.purchasedAt)}
            {paid !== undefined && <> for {formatPrice(paid)}</>}.
          </p>
        </div>
      )}

      {/* Wraps to two rows on very narrow screens (320px Display Zoom). */}
      <div className="flex gap-2 max-[359px]:flex-wrap max-[359px]:[&>*]:min-w-[calc(50%-4px)]">
        <Button variant="outline" className="flex-1 px-3" onClick={onEdit}>
          <PencilIcon /> Edit
        </Button>
        {(status === "locked" || status === "unlocked") && (
          <Button variant="outline" className="flex-1 px-3" onClick={archive}>
            <ArchiveIcon /> Archive
          </Button>
        )}
        <Button
          ref={deleteButtonRef}
          variant="outline"
          className="flex-1 px-3 text-destructive hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2Icon /> Delete
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            // Cancelled: back to Delete. Deleted: the sheet closes and the list takes focus.
            event.preventDefault();
            deleteButtonRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">Delete &ldquo;{want.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from this device and can&apos;t be undone. Export a backup first if you want a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
