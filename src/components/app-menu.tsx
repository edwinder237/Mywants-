"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  DownloadIcon,
  EllipsisIcon,
  HardDriveIcon,
  InfoIcon,
  MonitorIcon,
  MoonIcon,
  ShieldAlertIcon,
  SparklesIcon,
  SunIcon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Brand, Tagline } from "@/components/brand";
import { ImportDialog } from "@/components/import-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MAX_BACKUP_BYTES, backupFileName, createBackup, parseBackup } from "@/lib/backup";
import { storageEstimate } from "@/lib/db";
import { applyTheme, readTheme, type ThemePreference } from "@/lib/theme";
import type { WantsApi } from "@/lib/use-wants";
import { isDemo, type Want } from "@/lib/wants";

export interface AppMenuProps {
  api: Pick<WantsApi, "wants" | "merge" | "replaceAll" | "ready" | "loadError">;
  onAddExample: () => void;
}

const THEMES: { value: ThemePreference; label: string; icon: typeof SunIcon }[] = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
];

const wantsLabel = (n: number) => `${n} ${n === 1 ? "want" : "wants"}`;

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function AppMenu({ api, onAddExample }: AppMenuProps) {
  const { wants } = api;
  // Data actions only make sense once storage has loaded successfully.
  const storageOk = api.ready && !api.loadError;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Read on open rather than during render, so server and client markup match.
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [usage, setUsage] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Kept after closing so the sheet doesn't change while it animates out.
  const [pending, setPending] = useState<{ key: number; wants: Want[]; fileName: string } | null>(null);

  async function handleExport() {
    const json = JSON.stringify(createBackup(wants), null, 2);
    if (json.length > MAX_BACKUP_BYTES) {
      toast.warning("This backup is too large to import again. Remove some photos and export once more.");
    }
    const name = backupFileName();
    const file = new File([json], name, { type: "application/json" });
    // On phones the share sheet offers "Save to Files", which is friendlier
    // than a download in an installed iOS web app.
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (coarse && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`Exported ${wantsLabel(wants.length)}.`);
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      toast.error("This file is too large to be a My Wants backup. Nothing on this device was changed.");
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error("That file couldn't be read. Nothing on this device was changed.");
      return;
    }
    const result = parseBackup(text);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.wants.length === 0) {
      toast("That backup is empty. Nothing was changed.");
      return;
    }
    setPending((prev) => ({ key: (prev?.key ?? 0) + 1, wants: result.wants, fileName: file.name }));
    setImportOpen(true);
  }

  function openAbout() {
    setAboutOpen(true);
    void storageEstimate().then((est) => setUsage(est ? est.usage : null));
  }

  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && setTheme(readTheme())}>
        <DropdownMenuTrigger asChild>
          <Button ref={triggerRef} variant="ghost" size="icon" aria-label="Menu" className="shrink-0 rounded-full">
            <EllipsisIcon className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Backup</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => void handleExport()} disabled={wants.length === 0}>
            <DownloadIcon /> Export backup (JSON)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => fileInput.current?.click()} disabled={!storageOk}>
            <UploadIcon /> Import backup…
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => {
              const pref = value as ThemePreference;
              applyTheme(pref);
              setTheme(pref);
            }}
          >
            {THEMES.map(({ value, label, icon: Icon }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon aria-hidden className="size-4 text-muted-foreground" /> {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />
          {storageOk && !wants.some(isDemo) && (
            <DropdownMenuItem onSelect={onAddExample}>
              <SparklesIcon /> Add example want
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={openAbout}>
            <InfoIcon /> About my wants.
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFile}
        data-testid="import-input"
      />

      {pending && (
        <ImportDialog
          key={pending.key}
          open={importOpen}
          onOpenChange={setImportOpen}
          incoming={pending.wants}
          fileName={pending.fileName}
          existing={wants}
          onMerge={api.merge}
          onReplace={api.replaceAll}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        />
      )}

      <AboutDialog
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        usage={usage}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      />
    </>
  );
}

function AboutDialog({
  open,
  onOpenChange,
  usage,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usage: number | null;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        // Start at the top (the title), not on the Done button below the fold.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
            <span className="sr-only">About </span>
            <Brand as="span" />
          </DialogTitle>
          <DialogDescription asChild>
            <Tagline />
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 text-[15px] leading-relaxed">
          <section>
            <h3 className="font-medium">How it works</h3>
            <ol className="mt-3 flex flex-col gap-2.5">
              {[
                "Add something you want and choose three things to do first.",
                "Check them off as you go. When all three are done, it unlocks.",
                "Then decide: do you still want it, and can you comfortably afford it?",
              ].map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold tabular-nums"
                  >
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 rounded-2xl bg-unlock-soft px-4 py-3 text-sm">
              Unlocking means you can reconsider buying, not that you can afford it.
            </p>
          </section>

          <section>
            <h3 className="font-medium">Your data</h3>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground marker:text-border">
              <li>Stored only in this browser, on this device.</li>
              <li>Not synced between devices. Your iPhone and MacBook each keep their own list.</li>
              <li>
                Clearing site data or uninstalling the app deletes it. iOS may also clear it if the app goes unused for
                a while.
              </li>
              <li>Export a backup regularly from the menu.</li>
            </ul>
            {usage !== null && (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <HardDriveIcon aria-hidden className="size-4 shrink-0" />
                Using {formatBytes(usage)} on this device
              </p>
            )}
            <p className="mt-3 flex items-start gap-2 text-sm">
              <ShieldAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>Not a secure vault — don&apos;t store account numbers or passwords.</span>
            </p>
          </section>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
