import { create } from "zustand";
import { persist } from "zustand/middleware";

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

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "dark",
      setTheme: (theme) => set({ theme }),
    }),
    { name: "postwipe-theme" },
  ),
);
