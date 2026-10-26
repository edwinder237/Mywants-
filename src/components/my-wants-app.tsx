"use client";

import { useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { AppMenu } from "@/components/app-menu";
import { EmptyState } from "@/components/empty-state";
import { WantCard } from "@/components/want-card";
import { WantDetailDialog } from "@/components/want-detail-dialog";
import { WantFormDialog } from "@/components/want-form-dialog";
import { Button } from "@/components/ui/button";
import { useWants } from "@/lib/use-wants";
import { cn } from "@/lib/utils";
import { getStatus, isUnlocked, sortWants, type Want, type WantInput, type WantStatus } from "@/lib/wants";

const TABS: { key: WantStatus; label: string; empty: string }[] = [
  { key: "locked", label: "In progress", empty: "Nothing in progress. Add a want to get started." },
  { key: "unlocked", label: "Unlocked", empty: "Nothing unlocked yet. Finish all three dependencies on a want." },
  { key: "purchased", label: "Purchased", empty: "Nothing purchased yet." },
];

export function MyWantsApp() {
  const api = useWants();
  const [tab, setTab] = useState<WantStatus>("locked");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // "new" opens the create form; a want id opens the edit form.
  const [formTarget, setFormTarget] = useState<string | null>(null);

  const byStatus = useMemo(() => {
    const groups: Record<WantStatus, Want[]> = { locked: [], unlocked: [], purchased: [] };
    for (const w of api.wants) groups[getStatus(w)].push(w);
    for (const key of Object.keys(groups) as WantStatus[]) groups[key] = sortWants(groups[key]);
    return groups;
  }, [api.wants]);

  const selected = api.wants.find((w) => w.id === selectedId) ?? null;
  const editing = formTarget && formTarget !== "new" ? (api.wants.find((w) => w.id === formTarget) ?? null) : null;
  const visible = byStatus[tab];
  const hasAny = api.wants.length > 0;

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    try {
      return await action();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      return undefined;
    }
  }

  async function handleToggle(depId: string) {
    if (!selected) return;
    const wasUnlocked = isUnlocked(selected);
    const next = await run(() => api.toggle(selected.id, depId));
    if (next && !wasUnlocked && isUnlocked(next)) {
      toast.success(`${next.title} is unlocked`, {
        description: "Unlocked isn't the same as affordable. Check your budget first.",
      });
    }
  }

  async function handlePurchase() {
    if (!selected) return;
    const next = await run(() => api.purchase(selected.id));
    if (next) {
      setSelectedId(null);
      toast.success(`Marked ${next.title} as purchased`);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    const { id, title } = selected;
    setSelectedId(null);
    await run(() => api.remove(id));
    toast(`Deleted ${title}`);
  }

  async function handleSubmit(input: WantInput) {
    if (editing) {
      await api.edit(editing.id, input);
      toast.success("Saved");
    } else {
      const created = await api.add(input);
      setTab(getStatus(created));
    }
  }

  async function handleSample() {
    const sample = await run(() => api.addSample());
    if (sample) setTab("locked");
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="sticky top-0 z-30 bg-background/85 px-4 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center justify-between py-2">
          <div>
            <h1 className="font-serif text-[28px] leading-tight font-semibold tracking-tight">My Wants</h1>
            <p className="text-[13px] text-muted-foreground" aria-live="polite">
              {api.ready && hasAny
                ? `${byStatus.unlocked.length} unlocked · ${byStatus.locked.length} in progress`
                : "Three things first. Then it’s yours."}
            </p>
          </div>
          <AppMenu wants={api.wants} onReplaceAll={api.replaceAll} />
        </div>

        {hasAny && (
          <div role="tablist" aria-label="Filter wants" className="mt-2 mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-secondary p-1">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    active ? "bg-segment text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-xs tabular-nums",
                      t.key === "unlocked" && byStatus.unlocked.length > 0 ? "bg-unlock-soft text-unlock" : "",
                    )}
                  >
                    {byStatus[t.key].length}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      <main className="flex-1 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+104px)]">
        {api.loadError && (
          <p role="alert" className="mb-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {api.loadError}
          </p>
        )}

        {!api.ready ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
            {[0, 1].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-3xl bg-secondary/70" />
            ))}
          </div>
        ) : !hasAny ? (
          <EmptyState onAdd={() => setFormTarget("new")} onSample={handleSample} />
        ) : visible.length === 0 ? (
          <p className="px-6 pt-16 text-center text-[15px] text-muted-foreground">
            {TABS.find((t) => t.key === tab)?.empty}
          </p>
        ) : (
          <ul className="flex flex-col gap-3" role="tabpanel">
            {visible.map((w) => (
              <li key={w.id} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                <WantCard want={w} onOpen={() => setSelectedId(w.id)} />
              </li>
            ))}
          </ul>
        )}
      </main>

      {api.ready && hasAny && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-xl justify-end px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <Button
            size="lg"
            onClick={() => setFormTarget("new")}
            className="pointer-events-auto h-14 rounded-full px-6 shadow-lg shadow-primary/20"
          >
            <PlusIcon className="size-5" /> New want
          </Button>
        </div>
      )}

      <WantDetailDialog
        want={selected}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onToggle={handleToggle}
        onPurchase={handlePurchase}
        onEdit={() => {
          if (!selected) return;
          setFormTarget(selected.id);
          setSelectedId(null);
        }}
        onDelete={handleDelete}
      />

      <WantFormDialog
        open={formTarget !== null}
        onOpenChange={(open) => !open && setFormTarget(null)}
        want={editing}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
