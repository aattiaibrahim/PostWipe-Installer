import { useEffect } from "react";
import { useThemeStore, hydrateThemeFromDisk } from "../state/themeStore";

export function useApplyTheme() {
  const theme = useThemeStore((s) => s.theme);

  // Disk holds the durable choice; localStorage is just the pre-paint cache. Reconcile once
  // on mount so a relaunch restores the saved theme even if the WebView dropped localStorage.
  useEffect(() => {
    void hydrateThemeFromDisk();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
