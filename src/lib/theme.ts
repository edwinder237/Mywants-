// Light/dark theme preference. "system" follows the OS setting.
export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "my-wants-theme";

export function readTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/**
 * Point the browser chrome (iOS status bar, Android toolbar) at the chosen
 * theme. layout.tsx renders one theme-color meta per color scheme; a forced
 * theme enables only its own tag.
 */
export function syncThemeColor(pref: ThemePreference) {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media]').forEach((meta) => {
    const original = meta.dataset.media ?? meta.media;
    meta.dataset.media = original;
    if (pref === "system") meta.media = original;
    else meta.media = original.includes(pref) ? "all" : "not all";
  });
}

export function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  syncThemeColor(pref);
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage can be blocked; the choice then lasts for this session only.
  }
}

/** Inline script for <head>: applies the saved theme before first paint. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
