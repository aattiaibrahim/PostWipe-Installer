const COLORS: Record<string, string> = {
  gaming: "#f43f5e",
  overclocking: "#f97316",
  "file-compressors": "#14b8a6",
  security: "#22c55e",
  "dev-tools": "#3b82f6",
  browsers: "#a855f7",
  social: "#ec4899",
  "system-tweaks": "#eab308",
  "cursor-packs": "#06b6d4",
  fonts: "#8b5cf6",
  "audio-eq": "#f59e0b",
  "steam-profiles": "#6366f1",
  "system-sounds": "#10b981",
  personalization: "#e11d48",
};

const DEFAULT_COLOR = "#6d97ff";

export function categoryColor(categoryId: string): string {
  return COLORS[categoryId] ?? DEFAULT_COLOR;
}
