import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useDownloadHistoryStore } from "../state/downloadHistoryStore";
import { useDownloadQueueStore } from "../state/downloadQueueStore";
import { deleteDownload, pathsExist } from "../lib/tauriCommands";
import { useClickOutside } from "../hooks/useClickOutside";

const ACTIVE_STATUSES = new Set(["queued", "resolving", "downloading"]);

/** "…\Rufus.exe" → "EXE"; null when the filename has no real extension to show. */
function fileExt(destPath: string): string | null {
  const base = destPath.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1);
  return ext.length >= 2 && ext.length <= 4 ? ext.toUpperCase() : null;
}

export function DownloadHistoryPanel() {
  const [open, setOpen] = useState(false);
  const entries = useDownloadHistoryStore((s) => s.entries);
  const removeEntry = useDownloadHistoryStore((s) => s.removeEntry);
  const jobs = useDownloadQueueStore((s) => s.jobs);
  const panelRef = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  // destPath of the row whose ✕ was clicked — that row shows Delete?/Keep instead.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setConfirming(null);
      setDeleteError(null);
    }
  }, [open]);

  async function handleDelete(destPath: string) {
    try {
      await deleteDownload(destPath);
      removeEntry(destPath);
      setDeleteError(null);
    } catch (err) {
      setDeleteError(String(err));
    } finally {
      setConfirming(null);
    }
  }

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
                {downloadedEntries.map((entry) => {
                  const ext = fileExt(entry.destPath);
                  return (
                    <li key={entry.destPath} className="download-history__row">
                      <button className="download-history__item" onClick={() => revealItemInDir(entry.destPath)}>
                        {entry.appName}
                      </button>
                      {ext && <span className="download-history__ext">{ext}</span>}
                      {confirming === entry.destPath ? (
                        <span className="download-history__confirm">
                          <button
                            className="download-history__confirm-btn download-history__confirm-btn--delete"
                            onClick={() => handleDelete(entry.destPath)}
                          >
                            Delete?
                          </button>
                          <button className="download-history__confirm-btn" onClick={() => setConfirming(null)}>
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button
                          className="download-history__delete"
                          aria-label={`Delete ${entry.appName} download`}
                          title="Delete this file"
                          onClick={() => setConfirming(entry.destPath)}
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {deleteError && <p className="download-history__empty">Couldn't delete: {deleteError}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
