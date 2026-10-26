"use client";

import { useEffect } from "react";

import { readTheme, syncThemeColor } from "@/lib/theme";

/** Applies a saved Light/Dark choice to the theme-color metas after hydration. */
export function ThemeColorSync() {
  useEffect(() => {
    syncThemeColor(readTheme());
  }, []);
  return null;
}
