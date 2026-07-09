import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useDownloadHistoryStore } from "../state/downloadHistoryStore";
import { useDownloadQueueStore } from "../state/downloadQueueStore";
import { pathsExist } from "../lib/tauriCommands";
import { useClickOutside } from "../hooks/useClickOutside";

const ACTIVE_STATUSES = new Set(["queued", "resolving", "downloading"]);

export function DownloadHistoryPanel() {
  const [open, setOpen] = useState(false);
  const entries = useDownloadHistoryStore((s) => s.entries);
  const jobs = useDownloadQueueStore((s) => s.jobs);
  const panelRef = useClickOutside<HTMLDivElement>(open, () => setOpen(false));

  // Only files still present on disk count as "downloaded" — a history entry whose file
  // was deleted from the folder shouldn't be listed.
  const [existing, setExisting] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    const paths = entries.map((e) => e.destPath);
    pathsExist(paths)
      .then((flags) => {
        if (cancelled) return;
        setExisting(new Set(paths.filter((_, i) => flags[i])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entries, open]);

  const downloadedEntries = entries.filter((e) => existing.has(e.destPath));
  const activeJobs = Object.values(jobs).filter((j) => ACTIVE_STATUSES.has(j.status));

  return (
    <div className="download-history" ref={panelRef}>
      <button className="download-history__toggle" onClick={() => setOpen((o) => !o)}>
        Downloaded
        {downloadedEntries.length > 0 && <span className="download-history__count">{downloadedEntries.length}</span>}
        {activeJobs.length > 0 && (
          <span className="download-history__count download-history__count--active">{activeJobs.length}↓</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="download-history__dropdown"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            {activeJobs.length > 0 && (
              <ul className="download-history__list">
                {activeJobs.map((job) => {
                  const percent = job.totalBytes
                    ? Math.min(100, (job.bytesDownloaded / job.totalBytes) * 100)
                    : null;
                  return (
                    <li key={job.jobId} className="download-history__active-item">
                      <div className="download-history__active-row">
                        <span className="download-history__active-name">{job.appName}</span>
                        <span className="download-history__active-percent">
                          {percent !== null ? `${Math.round(percent)}%` : job.status}
                        </span>
                      </div>
                      <div className="download-history__bar-track">
                        <motion.div
                          className={`download-history__bar-fill${percent === null ? " download-history__bar-fill--indeterminate" : ""}`}
                          animate={{ width: `${percent ?? 30}%` }}
                          transition={{ type: "spring", stiffness: 200, damping: 30 }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {downloadedEntries.length === 0 && activeJobs.length === 0 ? (
              <p className="download-history__empty">Nothing downloaded yet.</p>
            ) : (
              <ul className="download-history__list">
                {downloadedEntries.map((entry) => (
                  <li key={entry.destPath}>
                    <button className="download-history__item" onClick={() => revealItemInDir(entry.destPath)}>
                      {entry.appName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
