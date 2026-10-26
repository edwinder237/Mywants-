"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { ImageIcon, ImagePlusIcon, LoaderCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { compressImage, ImageError } from "@/lib/image";
import { cn } from "@/lib/utils";

export interface ImageFieldProps {
  /** Compressed image data URL, or undefined for no photo. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Lets the form hold off saving while a photo is still being prepared. */
  onBusyChange?: (busy: boolean) => void;
  className?: string;
}

/** Optional photo picker: resizes on-device and shows a small preview. */
export function ImageField({ value, onChange, onBusyChange, className }: ImageFieldProps) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateBusy(next: boolean) {
    setBusy(next);
    onBusyChange?.(next);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still fires a change.
    event.target.value = "";
    if (!file) return;
    setError(null);
    updateBusy(true);
    try {
      onChange(await compressImage(file));
    } catch (err) {
      setError(err instanceof ImageError ? err.message : "That photo couldn't be used. Try another one.");
    } finally {
      updateBusy(false);
    }
  }

  function remove() {
    onChange(undefined);
    setError(null);
    // The Remove button disappears, so keep focus on the main photo button.
    buttonRef.current?.focus();
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <span id={labelId} className="text-sm leading-none font-medium">
        Photo <span className="font-normal text-muted-foreground">(optional)</span>
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        className="flex items-center gap-4"
      >
        <div
          className={cn(
            "relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl",
            value ? "bg-secondary" : "border border-dashed border-border bg-card text-muted-foreground",
            error && "border-destructive/60",
          )}
        >
          {value ? (
            // A local data URL; next/image adds nothing here in a static export.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Selected photo" className="size-full object-cover" />
          ) : (
            <ImageIcon aria-hidden className="size-7" strokeWidth={1.5} />
          )}
          {busy && (
            <div aria-hidden className="absolute inset-0 flex items-center justify-center bg-popover/70">
              <LoaderCircleIcon className="size-6 text-muted-foreground motion-safe:animate-spin" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <div className="flex flex-wrap gap-1">
            <Button
              ref={buttonRef}
              type="button"
              variant="outline"
              aria-label={value ? "Change photo" : undefined}
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy) inputRef.current?.click();
              }}
              className="aria-disabled:cursor-progress aria-disabled:opacity-60"
            >
              {value ? (
                "Change"
              ) : (
                <>
                  <ImagePlusIcon aria-hidden />
                  Add photo
                </>
              )}
            </Button>
            {value && !busy && (
              <Button
                type="button"
                variant="ghost"
                aria-label="Remove photo"
                onClick={remove}
                className="text-muted-foreground"
              >
                Remove
              </Button>
            )}
          </div>
          <p id={hintId} className="text-[13px] leading-snug text-muted-foreground">
            <span role="status">{busy ? "Preparing photo…" : null}</span>
            {!busy && "Stored on this device only, resized to save space."}
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={handleFile}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
