import type { EntryHealth } from "../lib/tauriCommands";

/** Human copy for each status. Deliberately says what we KNOW — "couldn't verify" rather
 *  than "might be broken" — because a yellow badge is usually our network's fault, not the
 *  vendor's, and telling the user otherwise would make them distrust working downloads. */
const COPY: Record<EntryHealth["status"], { label: string; title: string }> = {
  ok: {
    label: "working",
    title: "Checked recently — this download resolved and served a real file.",
  },
  unknown: {
    label: "unverified",
    title: "Couldn't check this one (the vendor blocked or ignored the check). It's probably fine — this is not a sign it's broken.",
  },
  broken: {
    label: "broken",
    title: "This download didn't work when last checked. You can still try it — the vendor may have fixed it since.",
  },
};

function Glyph({ status }: { status: EntryHealth["status"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (status === "ok") return <svg {...common}><path d="M5 13l4 4L19 7" /></svg>;
  if (status === "broken") return <svg {...common}><path d="M6 6l12 12M18 6L6 18" /></svg>;
  return <svg {...common}><path d="M12 8v5" /><path d="M12 17h.01" /></svg>;
}

/** The dot next to an app's name showing whether its download still works.
 *  Sourced from the weekly published sweep, or from a live check run in Settings. */
export function HealthBadge({ health }: { health: EntryHealth }) {
  const { label, title } = COPY[health.status];
  return (
    <span
      className={`health-badge health-badge--${health.status}`}
      // The detail line is the actual failure text ("served a web page instead of a file"),
      // which is what makes the badge actionable rather than just decorative.
      title={health.status === "ok" ? title : `${title}\n\n${health.detail}`}
    >
      <Glyph status={health.status} />
      <span className="health-badge__label">{label}</span>
    </span>
  );
}
