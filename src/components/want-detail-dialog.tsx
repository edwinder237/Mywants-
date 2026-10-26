"use client";

import { useState } from "react";
import { ExternalLinkIcon, LockIcon, LockOpenIcon, PencilIcon, ShoppingBagIcon, Trash2Icon } from "lucide-react";

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
import { ProgressSteps } from "@/components/progress-steps";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { completedCount, getStatus, type Want } from "@/lib/wants";

interface Props {
  want: Want | null;
  onOpenChange: (open: boolean) => void;
  onToggle: (depId: string) => void;
  onPurchase: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const dateFmt = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { dateStyle: "medium" });

export function WantDetailDialog({ want, onOpenChange, onToggle, onPurchase, onEdit, onDelete }: Props) {
  const [confirm, setConfirm] = useState<"purchase" | "delete" | null>(null);

  return (
    <>
      <Dialog open={want !== null} onOpenChange={onOpenChange}>
        <DialogContent>{want && <Detail want={want} onToggle={onToggle} onEdit={onEdit} onAsk={setConfirm} />}</DialogContent>
      </Dialog>

      <AlertDialog open={confirm === "purchase"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as purchased?</AlertDialogTitle>
            <AlertDialogDescription>
              Unlocking means you kept your three commitments. It doesn&apos;t mean this fits your budget, so only buy
              it if the money is really there. Once marked, the dependencies are frozen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction variant="unlock" onClick={onPurchase}>
              Mark purchased
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "delete"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{want?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from this device. You can&apos;t undo this unless you have an export.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Detail({
  want,
  onToggle,
  onEdit,
  onAsk,
}: {
  want: Want;
  onToggle: (depId: string) => void;
  onEdit: () => void;
  onAsk: (what: "purchase" | "delete") => void;
}) {
  const done = completedCount(want);
  const status = getStatus(want);
  const remaining = 3 - done;

  return (
    <>
      <DialogHeader>
        {want.isSample && (
          <Badge variant="sample" className="w-fit">
            Sample
          </Badge>
        )}
        <DialogTitle>{want.title}</DialogTitle>
        <DialogDescription className="text-base tabular-nums text-foreground/80">
          {formatPrice(want.priceCents, want.currency)} <span className="text-sm text-muted-foreground">{want.currency}</span>
        </DialogDescription>
      </DialogHeader>

      {(want.note || want.url) && (
        <div className="-mt-1 flex flex-col gap-2 text-[15px]">
          {want.note && <p className="whitespace-pre-line text-muted-foreground">{want.note}</p>}
          {want.url && (
            <a
              href={want.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit max-w-full items-center gap-1.5 text-foreground underline decoration-border underline-offset-4"
            >
              <span className="truncate">{new URL(want.url).hostname.replace(/^www\./, "")}</span>
              <ExternalLinkIcon className="size-3.5 shrink-0" />
            </a>
          )}
        </div>
      )}

      <section aria-labelledby="deps-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 id="deps-heading" className="text-sm font-medium">
            Dependencies
          </h3>
          <span className="text-sm text-muted-foreground tabular-nums">{done} of 3 done</span>
        </div>
        <ProgressSteps done={done} />
        <ul className="flex flex-col overflow-hidden rounded-2xl border bg-card">
          {want.dependencies.map((dep, i) => {
            const checked = dep.completedAt !== null;
            const id = `dep-${dep.id}`;
            return (
              <li key={dep.id} className="border-b last:border-b-0">
                <label
                  htmlFor={id}
                  className={cn(
                    "flex min-h-14 items-center gap-3.5 px-4 py-3",
                    status !== "purchased" && "cursor-pointer active:bg-accent",
                  )}
                >
                  <Checkbox
                    id={id}
                    checked={checked}
                    disabled={status === "purchased"}
                    onCheckedChange={() => onToggle(dep.id)}
                    aria-label={`${i + 1}. ${dep.title}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[15px] leading-snug break-words transition-colors",
                        checked && "text-muted-foreground line-through decoration-muted-foreground/40",
                      )}
                    >
                      {dep.title}
                    </span>
                    {dep.completedAt && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">Done {dateFmt(dep.completedAt)}</span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      {status === "locked" && (
        <div className="flex items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-3.5 text-[15px] text-muted-foreground">
          <LockIcon className="size-4 shrink-0" />
          <p>
            {remaining} more to unlock. You can mark it purchased once all three are done.
          </p>
        </div>
      )}

      {status === "unlocked" && (
        <div className="flex flex-col gap-3 rounded-2xl bg-unlock-soft px-4 py-4 animate-in fade-in slide-in-from-bottom-1 duration-300">
          <div className="flex items-start gap-3 text-[15px]">
            <LockOpenIcon className="mt-0.5 size-4 shrink-0 text-unlock" />
            <p>
              <span className="font-medium text-unlock">Unlocked.</span>{" "}
              <span className="text-foreground/80">
                You kept your word. That&apos;s not a budget check, so make sure it fits before you buy.
              </span>
            </p>
          </div>
          <Button variant="unlock" size="lg" onClick={() => onAsk("purchase")}>
            <ShoppingBagIcon /> Mark as purchased
          </Button>
        </div>
      )}

      {status === "purchased" && want.purchasedAt && (
        <div className="flex items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-3.5 text-[15px]">
          <ShoppingBagIcon className="size-4 shrink-0 text-muted-foreground" />
          <p>Purchased {dateFmt(want.purchasedAt)}.</p>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onEdit}>
          <PencilIcon /> Edit
        </Button>
        <Button variant="outline" className="flex-1 text-destructive" onClick={() => onAsk("delete")}>
          <Trash2Icon /> Delete
        </Button>
      </div>
    </>
  );
}
