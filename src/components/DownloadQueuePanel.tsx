import { AnimatePresence, motion } from "framer-motion";
import { useDownloadQueueStore } from "../state/downloadQueueStore";
import { cancelDownload } from "../lib/tauriCommands";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function DownloadQueuePanel() {
  const jobs = useDownloadQueueStore((s) => s.jobs);
  const activeJobs = Object.values(jobs).sort((a, b) => a.appName.localeCompare(b.appName));

  if (activeJobs.length === 0) return null;

  return (
    <div className="download-queue">
      <AnimatePresence initial={false}>
        {activeJobs.map((job) => {
          const percent = job.totalBytes ? Math.min(100, (job.bytesDownloaded / job.totalBytes) * 100) : null;
          const cancellable = job.status === "queued" || job.status === "resolving" || job.status === "downloading";
          return (
            <motion.div
              key={job.jobId}
              className="download-queue__item"
              layout
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            >
              <div className="download-queue__row">
                <span className="download-queue__name">{job.appName}</span>
                <span className={`download-queue__status download-queue__status--${job.status}`}>{job.status}</span>
                {cancellable && (
                  <button className="download-queue__cancel" onClick={() => cancelDownload(job.jobId)}>
                    Cancel
                  </button>
                )}
                {job.status === "completed" && job.destPath && (
                  <button className="download-queue__cancel" onClick={() => revealItemInDir(job.destPath!)}>
                    Reveal in Folder
                  </button>
                )}
              </div>
              <div className="download-queue__bar-track">
                <motion.div
                  className="download-queue__bar-fill"
                  animate={{ width: percent !== null ? `${percent}%` : job.status === "downloading" ? "100%" : "0%" }}
                  transition={{ type: "spring", stiffness: 200, damping: 30 }}
                />
              </div>
              <div className="download-queue__meta">
                {job.status === "failed" && job.error
                  ? job.error
                  : `${formatBytes(job.bytesDownloaded)}${job.totalBytes ? ` / ${formatBytes(job.totalBytes)}` : ""}`}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
