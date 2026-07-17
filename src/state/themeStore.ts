import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getSavedTheme, saveTheme } from "../lib/tauriCommands";

export type Theme = "light" | "dark" | "nord" | "dracula" | "catppuccin" | "gruvbox" | "solarized" | "rose-pine";

/** Every theme's palette lives in App.css under `:root[data-theme="<id>"]`. `swatch` is just
 *  for the Settings picker: [background, accent]. */
export const THEMES: { id: Theme; label: string; swatch: [string, string]; dark: boolean }[] = [
  { id: "light", label: "Light", swatch: ["#f0f1fa", "#1a2ffb"], dark: false },
  { id: "dark", label: "Dark", swatch: ["#0b0c16", "#4a5bfc"], dark: true },
  { id: "nord", label: "Nord", swatch: ["#2e3440", "#88c0d0"], dark: true },
  { id: "dracula", label: "Dracula", swatch: ["#282a36", "#bd93f9"], dark: true },
  { id: "catppuccin", label: "Catppuccin", swatch: ["#1e1e2e", "#cba6f7"], dark: true },
  { id: "gruvbox", label: "Gruvbox", swatch: ["#282828", "#fabd2f"], dark: true },
  { id: "rose-pine", label: "Rosé Pine", swatch: ["#191724", "#ebbcba"], dark: true },
  { id: "solarized", label: "Solarized", swatch: ["#fdf6e3", "#268bd2"], dark: false },
];

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "dark",
      // localStorage (via persist) is only a fast pre-paint cache — WebView2/WKWebView
      // don't reliably keep it across restarts, so disk is the real source of truth.
      setTheme: (theme) => {
        set({ theme });
        void saveTheme(theme);
      },
    }),
    { name: "postwipe-theme" },
  ),
);

/** Reconcile the store with the disk-backed value on launch (see settings.rs). Disk wins
 *  because localStorage may have been dropped; if disk is empty (first run) we seed it from
 *  whatever the store currently holds so the choice is durable from here on. */
export async function hydrateThemeFromDisk(): Promise<void> {
  const saved = await getSavedTheme();
  if (saved && THEME_IDS.has(saved)) {
    if (saved !== useThemeStore.getState().theme) useThemeStore.setState({ theme: saved as Theme });
  } else {
    void saveTheme(useThemeStore.getState().theme);
  }
}
