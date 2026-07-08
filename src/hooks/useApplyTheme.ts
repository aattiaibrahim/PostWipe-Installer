import { useEffect } from "react";
import { useThemeStore } from "../state/themeStore";

export function useApplyTheme() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
