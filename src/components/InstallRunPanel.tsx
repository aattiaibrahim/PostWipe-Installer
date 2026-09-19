import { motion } from "framer-motion";
import { useInstallStore, type InstallItem } from "../state/installStore";
import { useDownloadQueueStore } from "../state/downloadQueueStore";
import { useCatalogStore } from "../state/catalogStore";
import { AppIcon } from "./AppIcon";
import { DownloadSpinner } from "./DownloadSpinner";

const LABEL: Record<InstallItem["phase"], string> = {
  downloading: "Downloading",
  waiting: "Waiting",
  running: "Installing…",
  installed: "Installed",
  failed: "Failed",
  skipped: "Skipped",
  opened: "Finish in its window",
  portable: "Ready in folder",
  timed_out: "Still running",
};

const TONE: Partial<Record<InstallItem["phase"], string>> = {
  installed: "ok",
  failed: "bad",
  opened: "you",
  timed_out: "you",
};

function Row({ item }: { item: InstallItem }) {
  const job = useDownloadQueueStore((s) => s.jobs[item.jobId]);
  const app = useCatalogStore((s) => s.catalog?.categories.flatMap((c) => c.apps).find((a) => a.id === item.appId));
  const percent = item.phase === "downloading" && job?.totalBytes ? Math.round((job.bytesDownloaded / job.totalBytes) * 100) : null;
  const label =
    item.phase === "running" && item.mode === "interactive"
      ? "Finish it in its window"
      : percent !== null
        ? `Downloading ${percent}%`
        : LABEL[item.phase];
  return (
    <li className={`install-row install-row--${item.phase}`}>
      <AppIcon appId={item.appId} name={item.appName} domain={app?.domain} className="install-row__icon" />
      <div className="install-row__body">
        <strong>{item.appName}</strong>
        {item.detail && <span className="install-row__detail">{item.detail}</span>}
      </div>
      <span className={`install-row__state${TONE[item.phase] ? ` install-row__state--${TONE[item.phase]}` : ""}`}>
        {(item.phase === "running" || item.phase === "downloading") && <DownloadSpinner />}
        {item.phase === "installed" && "✓ "}
        {label}
      </span>
    </li>
  );
}

/** The current "Install for me" run, from download to installed, at the top of the Downloads
 *  page. It stays after finishing (with a summary) until it's cleared. */
export function InstallRunPanel() {
  const { stage, items, cancel, dismiss } = useInstallStore();
  if (stage === "idle") return null;

  const count = (phases: InstallItem["phase"][]) => items.filter((i) => phases.includes(i.phase)).length;
  const installed = count(["installed"]);
  const needsYou = count(["opened", "timed_out"]);
  const failed = count(["failed"]);
  const ready = count(["portable"]);
  const summary =
    stage === "downloading"
      ? `Downloading ${items.length - count(["downloading"])} of ${items.length} · installs start when they're all here`
      : stage === "installing"
        ? `Installing ${installed + needsYou + failed + count(["skipped", "portable"])} of ${items.length} · Windows may ask for admin once`
        : [
            `${installed} installed`,
            needsYou ? `${needsYou} to finish yourself` : "",
            ready ? `${ready} ready in the folder` : "",
            failed ? `${failed} failed` : "",
          ]
            .filter(Boolean)
            .join(" · ");

  return (
    <motion.section className="category-panel__section install-run" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="install-run__head">
        <div>
          <h2 className="category-panel__title">{stage === "done" ? "Install finished" : "Install for me"}</h2>
          <p className="install-run__summary">{summary}</p>
        </div>
        {stage === "done" ? (
          <button className="dl-btn" onClick={dismiss}>
            Clear
          </button>
        ) : (
          <button className="dl-btn" onClick={cancel}>
            Cancel remaining
          </button>
        )}
      </div>
      <ul className="install-run__list">
        {items.map((item) => (
          <Row key={item.jobId} item={item} />
        ))}
      </ul>
    </motion.section>
  );
}
