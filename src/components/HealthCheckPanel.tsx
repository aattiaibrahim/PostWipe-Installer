import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import type { HealthStatus } from "../lib/tauriCommands";
import { isTauri } from "../lib/tauriCommands";
import { useCatalogStore } from "../state/catalogStore";
import { useHealthStore } from "../state/healthStore";

interface ProgressEvent {
  done: number;
  total: number;
  appId: string;
  os: string;
  status: HealthStatus;
  detail: string;
}

const TAG: Record<HealthStatus, string> = {
  ok: "  OK  ",
  unknown: " ???? ",
  broken: " FAIL ",
};

/** Relative age of a report, for the "last checked" line. */
function ago(unixSeconds: number): string {
  const mins = Math.max(0, Math.round((Date.now() / 1000 - unixSeconds) / 60));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "Check All Downloads" plus the terminal that streams the results.
 *
 *  This runs a REAL sweep — resolving each entry and fetching the resolved URL with the
 *  downloader's own client — against the user's own network, which is the only verdict that
 *  actually predicts whether their download will work. The published weekly data that
 *  badges the catalog at launch comes from a CI runner, whose IP vendors frequently block. */
export function HealthCheckPanel() {
  const osFilter = useCatalogStore((s) => s.osFilter);
  const catalog = useCatalogStore((s) => s.catalog);
  const { running, done, total, lines, report, finishedAt, checkedOs } = useHealthStore();
  const run = useHealthStore((s) => s.run);
  const start = useHealthStore((s) => s.start);
  const push = useHealthStore((s) => s.push);
  const load = useHealthStore((s) => s.load);
  const logRef = useRef<HTMLDivElement>(null);
  /* The settings dock is a ~180px column — a terminal in it is unreadable, and the whole
     point of this view is watching the lines scroll. It lives in a centered overlay
     instead, which also lets the sweep keep running while the user browses the catalog. */
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isTauri) return;
    const unlisten = [
      listen<{ total: number }>("health-check:start", (e) => start(e.payload.total)),
      listen<ProgressEvent>("health-check:progress", (e) =>
        push({ appId: e.payload.appId, status: e.payload.status, detail: e.payload.detail }),
      ),
    ];
    return () => {
      void Promise.all(unlisten).then((fns) => fns.forEach((fn) => fn()));
    };
  }, [start, push]);

  useEffect(() => {
    if (!useHealthStore.getState().loaded) void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Keep the newest line visible, the way a real terminal behaves.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  // App names for the log — the backend streams ids, which aren't what the user reads.
  const names: Record<string, string> = {};
  for (const category of catalog?.categories ?? []) {
    for (const app of category.apps) names[app.id] = app.name;
  }

  const counts = report ? report.entries.reduce(
    (acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }),
    {} as Record<HealthStatus, number>,
  ) : null;

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const osLabel = osFilter === "windows" ? "Windows" : "macOS";

  /* ~30 of the entries for a given OS resolve through api.github.com, and an unauthenticated
     check gets 60 requests per hour PER IP. Run the sweep twice in an hour and every one of
     them comes back amber for a reason that has nothing to do with the download. Saying so
     outright beats leaving the user to puzzle over 30 identical yellow rows. */
  const rateLimited = lines.filter((l) => l.detail.includes("api.github.com")).length;

  return (
    <div className="health-check">
      <div className="health-check__head">
        <button
          className="settings-panel__check-btn"
          onClick={() => {
            setOpen(true);
            if (!running) void run(osFilter);
          }}
        >
          {running ? `Checking… ${done}/${total || "?"}` : "Check All Downloads"}
        </button>
        {!running && report && (
          <span className="health-check__meta">
            {report.source === "local"
              ? `You checked ${checkedOs === "macos" ? "macOS" : checkedOs === "windows" ? "Windows" : ""}`.trim()
              : "Weekly check"}{" "}
            · {ago(report.generated_at)}
            {counts && (
              <>
                {" · "}
                <span className="health-check__count health-check__count--ok">{counts.ok ?? 0} ok</span>
                {(counts.unknown ?? 0) > 0 && (
                  <>
                    {" · "}
                    <span className="health-check__count health-check__count--unknown">
                      {counts.unknown} unverified
                    </span>
                  </>
                )}
                {(counts.broken ?? 0) > 0 && (
                  <>
                    {" · "}
                    <span className="health-check__count health-check__count--broken">{counts.broken} broken</span>
                  </>
                )}
              </>
            )}
          </span>
        )}
      </div>

      {createPortal(
        <AnimatePresence>
          {open && (running || lines.length > 0) && (
            <motion.div
              className="confirm-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setOpen(false)}
            >
          <motion.div
            className="health-check__terminal"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="health-check__terminal-bar">
              <span className="health-check__dot health-check__dot--red" />
              <span className="health-check__dot health-check__dot--amber" />
              <span className="health-check__dot health-check__dot--green" />
              <span className="health-check__terminal-title">catalog-health — {osLabel}</span>
              {/* Closing only hides the window; the sweep keeps running and the badges
                  still update when it lands. */}
              <button className="health-check__close" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="health-check__log" ref={logRef}>
              <div className="health-check__line health-check__line--muted">
                $ postwipe check --os {osFilter}
              </div>
              {lines.map((line, i) => (
                <motion.div
                  key={`${line.appId}-${i}`}
                  className="health-check__line"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.14 }}
                >
                  <span className={`health-check__tag health-check__tag--${line.status}`}>[{TAG[line.status]}]</span>
                  <span className="health-check__app">{names[line.appId] ?? line.appId}</span>
                  {line.status !== "ok" && <span className="health-check__detail">{line.detail}</span>}
                </motion.div>
              ))}
              {running && (
                <div className="health-check__line health-check__line--muted">
                  <span className="health-check__cursor" />
                </div>
              )}
              {!running && finishedAt && (
                <div className="health-check__line health-check__line--muted">
                  $ done — {done} checked
                </div>
              )}
              {!running && rateLimited > 3 && (
                <div className="health-check__line health-check__note">
                  ! {rateLimited} entries hit GitHub's hourly limit for unauthenticated checks, not a
                  problem with the downloads. Wait an hour and re-run to see their real status.
                </div>
              )}
            </div>
            {running && (
              <div className="health-check__progress">
                <motion.div
                  className="health-check__progress-fill"
                  animate={{ width: `${pct}%` }}
                  transition={{ ease: "easeOut", duration: 0.25 }}
                />
              </div>
            )}
          </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
