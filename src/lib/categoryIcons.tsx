import { ALL_CATEGORY_ID } from "./constants";

const PATHS: Record<string, string[]> = {
  gaming: [
    "M17.5 8h-11A4.5 4.5 0 0 0 2 12.5A3.5 3.5 0 0 0 5.5 16c1 0 1.6-.4 2.2-1l.7-.7a2 2 0 0 1 1.4-.6h4.4a2 2 0 0 1 1.4.6l.7.7c.6.6 1.2 1 2.2 1a3.5 3.5 0 0 0 3.5-3.5A4.5 4.5 0 0 0 17.5 8Z",
    "M7 10.5v3M5.5 12h3",
  ],
  overclocking: ["M4 15a8 8 0 1 1 16 0", "M12 15l4-5"],
  "file-compressors": [
    "M3 4.5A1.5 1.5 0 0 1 4.5 3h15A1.5 1.5 0 0 1 21 4.5V7H3Z",
    "M5 7v10.5A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V7",
    "M10 12h4",
  ],
  security: ["M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"],
  "dev-tools": ["M9 8l-4 4 4 4", "M15 8l4 4-4 4"],
  browsers: ["M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16Z", "M4 12h16", "M12 4c3 3 3 13 0 16", "M12 4c-3 3-3 13 0 16"],
  social: ["M4 5h16v10H8l-4 4V5Z"],
  "system-tweaks": [
    "M4 6h10M17 6h3",
    "M4 12h3M10 12h10",
    "M4 18h10M17 18h3",
  ],
};

const DOTS: Record<string, { cx: number; cy: number }[]> = {
  gaming: [
    { cx: 15, cy: 10.5 },
    { cx: 17, cy: 12.5 },
  ],
  overclocking: [{ cx: 12, cy: 15 }],
  "system-tweaks": [
    { cx: 14, cy: 6 },
    { cx: 7, cy: 12 },
    { cx: 14, cy: 18 },
  ],
};

const FALLBACK = ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"];

export function CategoryIcon({ categoryId, className }: { categoryId: string; className?: string }) {
  if (categoryId === ALL_CATEGORY_ID) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.4" />
        <rect x="14" y="3" width="7" height="7" rx="1.4" />
        <rect x="3" y="14" width="7" height="7" rx="1.4" />
        <rect x="14" y="14" width="7" height="7" rx="1.4" />
      </svg>
    );
  }

  const paths = PATHS[categoryId] ?? FALLBACK;
  const dots = DOTS[categoryId] ?? [];
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
      {dots.map((dot, i) => (
        <circle key={i} cx={dot.cx} cy={dot.cy} r="1" fill="currentColor" stroke="none" />
      ))}
    </svg>
  );
}
