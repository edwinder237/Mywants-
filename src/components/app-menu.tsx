"use client";

import { useRef, useState } from "react";
import { DownloadIcon, EllipsisIcon, InfoIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { backupFileName, createBackup, parseBackup } from "@/lib/backup";
import type { Want } from "@/lib/wants";

interface Props {
  wants: Want[];
  onReplaceAll: (wants: Want[]) => Promise<void>;
}

export function AppMenu({ wants, onReplaceAll }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Want[] | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  async function handleExport() {
    const json = JSON.stringify(createBackup(wants), null, 2);
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
    toast.success(`Exported ${wants.length} ${wants.length === 1 ? "want" : "wants"}`);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const result = parseBackup(await file.text());
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPending(result.wants);
  }

  async function confirmImport() {
    if (!pending) return;
    try {
      await onReplaceAll(pending);
      toast.success(`Imported ${pending.length} ${pending.length === 1 ? "want" : "wants"}`);
    } catch {
      toast.error("Import failed. Your existing data was not changed.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Menu" className="rounded-full">
            <EllipsisIcon className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Backup</DropdownMenuLabel>
          <DropdownMenuItem onSelect={handleExport} disabled={wants.length === 0}>
            <DownloadIcon /> Export to JSON
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
            <UploadIcon /> Import from JSON
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setAboutOpen(true)}>
            <InfoIcon /> About My Wants
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

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your data?</AlertDialogTitle>
            <AlertDialogDescription>
              This file has {pending?.length ?? 0} {pending?.length === 1 ? "want" : "wants"}. Importing replaces the{" "}
              {wants.length} on this device. Export first if you want a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>About My Wants</DialogTitle>
            <DialogDescription>A small commitment device for things you&apos;d like to buy.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 text-[15px] leading-relaxed">
            <p>
              Each want has three dependencies. Finish all three and it unlocks. Only then can you mark it purchased.
            </p>
            <p>
              <span className="font-medium">An unlock is not a budget check.</span> It means you did what you said
              you&apos;d do. It doesn&apos;t mean you can afford it. Check your finances before you buy.
            </p>
            <p className="text-muted-foreground">
              Your data is stored only in this browser on this device. Clearing site data or uninstalling deletes it.
              Export a backup now and then.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
