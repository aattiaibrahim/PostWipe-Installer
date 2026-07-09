const COLORS: Record<string, string> = {
  gaming: "#f43f5e",
  overclocking: "#f97316",
  "file-compressors": "#14b8a6",
  security: "#22c55e",
  "dev-tools": "#3b82f6",
  browsers: "#a855f7",
  social: "#ec4899",
  "system-tweaks": "#eab308",
  specials: "#7c3aed",
};

const DEFAULT_COLOR = "#6d97ff";

export function categoryColor(categoryId: string): string {
  return COLORS[categoryId] ?? DEFAULT_COLOR;
}
