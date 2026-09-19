import { useState } from "react";
import { motion } from "framer-motion";
import { useInstallStore, type InstallItem } from "../state/installStore";
import { useDownloadQueueStore } from "../state/downloadQueueStore";
import { useCatalogStore } from "../state/catalogStore";
import { openDownload } from "../lib/tauriCommands";
import { AppIcon } from "./AppIcon";

/** Ninite's status words: short, and the same whatever the installer is. */
const STATUS: Record<InstallItem["phase"], string> = {
  downloading: "Downloading",
  waiting: "Waiting to install",
  running: "Installing…",
  installed: "OK",
  failed: "Failed",
  skipped: "Skipped",
  opened: "Opened",
  portable: "Ready in folder",
  timed_out: "Still running",
  manual: "Needs you",
};

const DONE: InstallItem["phase"][] = ["installed", "failed", "skipped", "opened", "portable", "timed_out", "manual"];

function Row({ item }: { item: InstallItem }) {
  const job = useDownloadQueueStore((s) => s.jobs[item.jobId]);
  const app = useCatalogStore((s) => s.catalog?.categories.flatMap((c) => c.apps).find((a) => a.id === item.appId));
  const [ran, setRan] = useState(false);
  const status =
    item.phase === "downloading"
      ? job?.totalBytes
        ? `Downloading ${Math.round((job.bytesDownloaded / job.totalBytes) * 100)}%`
        : job?.status === "queued" || job?.status === "resolving"
          ? "Waiting to download"
          : "Downloading"
      : STATUS[item.phase];
  const tone = item.phase === "installed" ? "ok" : item.phase === "failed" ? "bad" : item.phase === "manual" || item.phase === "timed_out" ? "you" : "";
  return (
    <tr className={`install-table__row install-table__row--${item.phase}`}>
      <td>
        <span className="install-table__app">
          <AppIcon appId={item.appId} name={item.appName} domain={app?.domain} className="install-table__icon" />
          {item.appName}
        </span>
      </td>
      <td className={`install-table__status${tone ? ` install-table__status--${tone}` : ""}`} title={item.detail ?? undefined}>
        {status}
        {item.detail && item.phase !== "manual" && <span className="install-table__detail"> · {item.detail}</span>}
      </td>
      <td className="install-table__action">
        {item.phase === "manual" && item.path && (
          <button
            className="dl-btn"
            onClick={() => {
              setRan(true);
              void openDownload(item.path!).catch(() => setRan(false));
            }}
          >
            {ran ? "Opened" : "Run installer"}
          </button>
        )}
      </td>
    </tr>
  );
}

/** Ninite-style progress for "Install all at once": one bar for the whole run and a plain
 *  Application / Status table. Nothing here opens an installer window by itself; apps that only
 *  have a wizard wait under "Needs you" with a Run installer button. */
export function InstallRunPanel() {
  const { stage, items, cancel, dismiss } = useInstallStore();
  if (stage === "idle") return null;

  const finished = items.filter((i) => DONE.includes(i.phase)).length;
  // Downloads count as half of each app's share, so the bar moves from the first second.
  const progress = items.length
    ? items.reduce((sum, i) => sum + (DONE.includes(i.phase) ? 1 : i.phase === "waiting" || i.phase === "running" ? 0.5 : 0), 0) /
      items.length
    : 0;
  const current = items.find((i) => i.phase === "running");
  const headline =
    stage === "done"
      ? "Done"
      : current
        ? `Installing ${current.appName}…`
        : stage === "downloading"
          ? "Downloading…"
          : "Installing…";
  const installed = items.filter((i) => i.phase === "installed").length;
  const manual = items.filter((i) => i.phase === "manual").length;
  const failed = items.filter((i) => i.phase === "failed").length;
  const summary =
    stage === "done"
      ? [`${installed} installed`, manual ? `${manual} need${manual === 1 ? "s" : ""} you` : "", failed ? `${failed} failed` : ""]
          .filter(Boolean)
          .join(" · ")
      : `${finished} of ${items.length} done · no clicking Next, Windows asks for admin once`;
  // Needs-you rows go last, like a to-do list for after the run.
  const ordered = [...items].sort((a, b) => Number(a.phase === "manual") - Number(b.phase === "manual"));

  return (
    <motion.section className="category-panel__section install-run" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="install-run__head">
        <div>
          <h2 className="category-panel__title">{headline}</h2>
          <p className="install-run__summary">{summary}</p>
        </div>
        {stage === "done" ? (
          <button className="dl-btn" onClick={dismiss}>
            Close
          </button>
        ) : (
          <button className="dl-btn" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
      <div className="install-run__bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <motion.div
          className="install-run__fill"
          animate={{ width: `${Math.max(progress * 100, stage === "done" ? 100 : 2)}%` }}
          transition={{ type: "spring", stiffness: 160, damping: 28 }}
        />
      </div>
      <table className="install-table">
        <thead>
          <tr>
            <th>Application</th>
            <th>Status</th>
            <th aria-label="Action" />
          </tr>
        </thead>
        <tbody>
          {ordered.map((item) => (
            <Row key={item.jobId} item={item} />
          ))}
        </tbody>
      </table>
    </motion.section>
  );
}
