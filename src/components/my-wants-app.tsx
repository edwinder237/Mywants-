"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveIcon,
  LockIcon,
  LockOpenIcon,
  PlusIcon,
  ShoppingBagIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AppMenu } from "@/components/app-menu";
import { Brand, Tagline } from "@/components/brand";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { WantCard, type CardAction } from "@/components/want-card";
import { WantDetailDialog, type DetailView } from "@/components/want-detail-dialog";
import { WantFormDialog } from "@/components/want-form-dialog";
import { useWants } from "@/lib/use-wants";
import { cn } from "@/lib/utils";
import {
  categoriesOf,
  DEMO_WANT_ID,
  getStatus,
  sortWants,
  type PurchaseInput,
  type Want,
  type WantInput,
  type WantStatus,
} from "@/lib/wants";

const FILTERS: { key: WantStatus; label: string; icon: LucideIcon; empty: string }[] = [
  {
    key: "locked",
    label: "Locked",
    icon: LockIcon,
    empty: "Nothing locked. Add something you want and pick three things to do first.",
  },
  {
    key: "unlocked",
    label: "Unlocked",
    icon: LockOpenIcon,
    empty: "Nothing unlocked yet. Finish all three dependencies on a want to unlock it.",
  },
  { key: "purchased", label: "Purchased", icon: ShoppingBagIcon, empty: "No purchases yet." },
  {
    key: "archived",
    label: "Archived",
    icon: ArchiveIcon,
    empty: "Nothing archived. Archive a want to set it aside without deleting it.",
  },
];

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.";
}

/** Run a change; on failure toast its user-facing message. Resolves true on success. */
async function attempt(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (err) {
    toast.error(messageOf(err));
    return false;
  }
}

export function MyWantsApp() {
  const api = useWants();
  const [filter, setFilter] = useState<WantStatus>("locked");
  const [sheet, setSheet] = useState<{ selectedId: string; detailView: DetailView } | null>(null);
  // Target is kept while the form animates closed so its content doesn't flip.
  const [form, setForm] = useState<{ open: boolean; target: "new" | string }>({ open: false, target: "new" });
  // Focus to move after the next commit (e.g. when the focused card leaves the list).
  const [focusRequest, setFocusRequest] = useState<{ wantId: string | null } | null>(null);

  const listRef = useRef<HTMLUListElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const newWantRef = useRef<HTMLButtonElement>(null);
  /** The want whose card opened the current sheet, for focus return. */
  const returnFocusId = useRef<string | null>(null);
  /** True while the detail sheet hands over to the edit form, which keeps focus. */
  const handingOff = useRef(false);

  const groups = useMemo(() => {
    const byStatus: Record<WantStatus, Want[]> = { locked: [], unlocked: [], purchased: [], archived: [] };
    for (const w of api.wants) byStatus[getStatus(w)].push(w);
    for (const key of Object.keys(byStatus) as WantStatus[]) byStatus[key] = sortWants(byStatus[key]);
    return byStatus;
  }, [api.wants]);
  const categories = useMemo(() => categoriesOf(api.wants), [api.wants]);

  // On first load, open the first filter that has something in it (Locked
  // first), so unlocked or purchased wants aren't hidden behind an empty list.
  const [pickedInitialFilter, setPickedInitialFilter] = useState(false);
  if (api.ready && !pickedInitialFilter) {
    setPickedInitialFilter(true);
    const first = FILTERS.find((f) => groups[f.key].length > 0);
    if (first && first.key !== filter) setFilter(first.key);
  }

  const selected = sheet ? (api.wants.find((w) => w.id === sheet.selectedId) ?? null) : null;
  const editing = form.target === "new" ? null : (api.wants.find((w) => w.id === form.target) ?? null);
  const formOpen = form.open && (form.target === "new" || editing !== null);
  const hasAny = api.wants.length > 0;
  const showList = api.ready && hasAny;
  const current = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const visible = groups[filter];

  // ---- Focus return ------------------------------------------------------

  /** The card's primary action if it's still listed, else the pressed filter, else New want. */
  const focusTarget = useCallback((wantId: string | null): HTMLElement | null => {
    if (wantId) {
      const actions = listRef.current?.querySelectorAll<HTMLElement>("[data-want-id]") ?? [];
      const match = Array.from(actions).find((el) => el.dataset.wantId === wantId);
      if (match) return match;
    }
    return filtersRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? newWantRef.current;
  }, []);

  useEffect(() => {
    if (focusRequest) focusTarget(focusRequest.wantId)?.focus();
  }, [focusRequest, focusTarget]);

  const returnFocus = useCallback(
    (event: Event) => {
      const target = focusTarget(returnFocusId.current);
      // Nothing better to offer (first run): let the dialog restore focus itself.
      if (!target) return;
      event.preventDefault();
      target.focus();
    },
    [focusTarget],
  );

  const handleDetailCloseAutoFocus = useCallback(
    (event: Event) => {
      if (handingOff.current) {
        handingOff.current = false;
        event.preventDefault();
        return;
      }
      returnFocus(event);
    },
    [returnFocus],
  );

  // ---- Actions -----------------------------------------------------------

  function openNew() {
    returnFocusId.current = null;
    setForm({ open: true, target: "new" });
  }

  const restore = (want: Want) =>
    attempt(async () => {
      await api.restore(want.id);
      toast.success(`Restored ${want.name}.`);
    });

  async function restoreFromCard(want: Want) {
    const active = document.activeElement;
    const hadFocus = active instanceof HTMLElement && active.dataset.wantId === want.id;
    // The card leaves the Archived list, so keep keyboard focus somewhere sensible.
    if ((await restore(want)) && hadFocus) setFocusRequest({ wantId: want.id });
  }

  function handleCardAction(want: Want, action: CardAction) {
    returnFocusId.current = want.id;
    if (action === "restore") {
      void restoreFromCard(want);
      return;
    }
    handingOff.current = false;
    setSheet({ selectedId: want.id, detailView: action === "decide" ? "decide" : "detail" });
  }

  async function addExample(from: "empty" | "menu") {
    if (!(await attempt(() => api.addDemo()))) return;
    setFilter("locked");
    // From the empty state the focused button disappears; from the menu, focus returns to it.
    if (from === "empty") setFocusRequest({ wantId: DEMO_WANT_ID });
    else toast.success("Added an example want.");
  }

  const withSelected = (action: (want: Want) => Promise<void>) =>
    selected ? attempt(() => action(selected)) : Promise.resolve(false);

  // The list follows the open want when an action changes its status, so its
  // card is on screen (and can take focus back) when the sheet closes. The
  // unlock moment itself is shown in the sheet, so no toast for it.
  const follow = (want: Want) => setFilter(getStatus(want));

  const handleToggle = (dependencyId: string) =>
    withSelected(async (want) => follow(await api.toggle(want.id, dependencyId)));

  const handlePurchase = (input: PurchaseInput) =>
    withSelected(async (want) => {
      follow(await api.purchase(want.id, input));
      toast.success(`Marked ${want.name} as purchased.`);
    });

  const handleArchive = ({ undo = true }: { undo?: boolean } = {}) =>
    withSelected(async (want) => {
      follow(await api.archive(want.id));
      // From the open sheet its Restore button is right there (and the modal sheet blocks the toast).
      toast(`Archived ${want.name}.`, undo ? { action: { label: "Undo", onClick: () => void restore(want) } } : {});
    });

  const handleRestore = () =>
    withSelected(async (want) => {
      follow(await api.restore(want.id));
      toast.success(`Restored ${want.name}.`);
    });

  const handleDelete = () =>
    withSelected(async (want) => {
      await api.remove(want.id);
      toast(`Deleted ${want.name}.`);
    });

  function handleEdit() {
    if (!selected) return;
    handingOff.current = true;
    setForm({ open: true, target: selected.id });
    setSheet(null);
  }

  async function handleSubmit(input: WantInput, purchase?: PurchaseInput) {
    if (editing) {
      await api.edit(editing.id, input, purchase);
      toast.success("Saved.");
    } else {
      const created = await api.add(input);
      returnFocusId.current = created.id;
      setFilter("locked");
    }
  }

  // ---- Render ------------------------------------------------------------

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <header className="sticky top-0 z-30 bg-background/85 px-4 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <Brand />
            {showList ? (
              <p className="mt-1.5 truncate text-[13px] text-muted-foreground tabular-nums">
                {`${groups.locked.length} locked · ${groups.unlocked.length} unlocked · ${groups.purchased.length} purchased`}
              </p>
            ) : (
              // The empty state already leads with the tagline.
              !api.ready && <Tagline className="mt-1.5 truncate text-[13px] text-muted-foreground" />
            )}
          </div>
          <AppMenu api={api} onAddExample={() => void addExample("menu")} />
        </div>

        {showList && (
          <div
            ref={filtersRef}
            role="group"
            aria-label="Filter wants"
            className="mt-1 mb-3 grid grid-cols-4 gap-1 rounded-2xl bg-secondary p-1"
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              const count = groups[f.key].length;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    // Label first in the DOM (accessible name "Locked 2"), count shown on top.
                    "flex h-14 min-w-0 flex-col-reverse items-center justify-center gap-1 rounded-xl px-1 transition-[background-color,color,box-shadow] duration-200 outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-secondary",
                    active ? "bg-segment text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="max-w-full truncate text-xs leading-none font-medium max-[359px]:text-[11px]">
                    {f.label}
                  </span>{" "}
                  <span
                    className={cn(
                      "text-lg leading-none font-semibold tabular-nums",
                      f.key === "unlocked" && count > 0 && "text-unlock",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      <main
        className={cn(
          "flex-1 px-4 pt-2",
          showList ? "pb-[calc(env(safe-area-inset-bottom)+104px)]" : "pb-[max(env(safe-area-inset-bottom),24px)]",
        )}
      >
        {api.skipped > 0 && <SkippedNotice count={api.skipped} />}

        {!api.ready ? (
          <LoadingCards />
        ) : !hasAny ? (
          <EmptyState loadError={api.loadError} onAdd={openNew} onExample={() => void addExample("empty")} />
        ) : visible.length === 0 ? (
          <FilterEmpty icon={current.icon} text={current.empty} />
        ) : (
          // role="list" keeps list semantics in Safari/VoiceOver despite list-style: none.
          <ul ref={listRef} role="list" aria-label={`${current.label} wants`} className="flex flex-col gap-3">
            {visible.map((w) => (
              <li
                key={w.id}
                className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
              >
                <WantCard want={w} onAction={handleCardAction} />
              </li>
            ))}
          </ul>
        )}
      </main>

      {showList && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-xl justify-end px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <Button
            ref={newWantRef}
            size="lg"
            onClick={openNew}
            className="pointer-events-auto h-14 rounded-full px-6 shadow-lg shadow-primary/20"
          >
            <PlusIcon className="size-5" /> New want
          </Button>
        </div>
      )}

      <WantDetailDialog
        want={selected}
        initialView={sheet?.detailView ?? "detail"}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
        onToggle={handleToggle}
        onPurchase={handlePurchase}
        onArchive={handleArchive}
        onRestore={handleRestore}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onCloseAutoFocus={handleDetailCloseAutoFocus}
      />

      <WantFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) setForm((f) => ({ ...f, open: false }));
        }}
        want={editing}
        categories={categories}
        onSubmit={handleSubmit}
        onCloseAutoFocus={returnFocus}
      />
    </div>
  );
}

function LoadingCards() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Loading your wants…</span>
      {[0, 1].map((i) => (
        <div key={i} aria-hidden className="rounded-3xl border bg-card p-4">
          <div className="flex gap-3.5">
            <div className="size-16 shrink-0 rounded-2xl bg-secondary motion-safe:animate-pulse" />
            <div className="flex flex-1 flex-col gap-2.5 pt-1">
              <div className="h-4 w-2/3 rounded-full bg-secondary motion-safe:animate-pulse" />
              <div className="h-3 w-1/4 rounded-full bg-secondary motion-safe:animate-pulse" />
              <div className="h-6 w-28 rounded-full bg-secondary motion-safe:animate-pulse" />
            </div>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-secondary motion-safe:animate-pulse" />
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="h-3 w-1/2 rounded-full bg-secondary motion-safe:animate-pulse" />
            <div className="h-11 w-36 rounded-xl bg-secondary motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterEmpty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center px-6 pt-14 pb-6 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function SkippedNotice({ count }: { count: number }) {
  const one = count === 1;
  return (
    <p className="mb-4 flex items-start gap-2.5 rounded-2xl border border-example/40 bg-example/10 px-4 py-3 text-sm leading-snug">
      <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-example" />
      <span>
        {count} saved {one ? "item" : "items"} couldn&apos;t be read and {one ? "is" : "are"} hidden.{" "}
        {one ? "It's" : "They're"} still stored on this device.
      </span>
    </p>
  );
}
