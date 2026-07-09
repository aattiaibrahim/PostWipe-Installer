import { useState } from "react";
import type { SpecialsItem as Item } from "../state/specialsContentStore";
import type { SpecialsCategoryMeta } from "../lib/specialsConfig";
import { SPECIALS_WORKER_URL } from "../lib/specialsConfig";
import { useSpecialsStore } from "../state/specialsStore";
import { useDownloadQueueStore } from "../state/downloadQueueStore";
import { startSpecialsDownload, installSpecialsItem } from "../lib/tauriCommands";

const ACTIVE_STATUSES = new Set(["queued", "resolving", "downloading"]);

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function SpecialsItem({ item, meta }: { item: Item; meta: SpecialsCategoryMeta }) {
  const sessionKey = useSpecialsStore((s) => s.sessionKey);
  const jobs = useDownloadQueueStore((s) => s.jobs);
  const [destPath, setDestPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<string | null>(null);

  const job = Object.values(jobs)
    .reverse()
    .find((j) => j.appId === item.objectKey);
  const downloading = !!job && ACTIVE_STATUSES.has(job.status);
  const failed = job?.status === "failed";
  const downloaded = !!destPath || job?.status === "completed";
  const path = destPath ?? job?.destPath ?? null;
  const canInstall = meta.install !== "none";

  const percent = job?.totalBytes ? Math.min(100, (job.bytesDownloaded / job.totalBytes) * 100) : null;

  async function download() {
    if (!sessionKey) return;
    setError(null);
    const encoded = item.objectKey.split("/").map(encodeURIComponent).join("/");
    const url = `${SPECIALS_WORKER_URL}/file/${encoded}?key=${encodeURIComponent(sessionKey)}`;
    try {
      const { destPath: dp } = await startSpecialsDownload(item.objectKey, item.name, url, item.filename);
      setDestPath(dp);
    } catch (err) {
      setError(String(err));
    }
  }

  async function install() {
    if (!path) return;
    setInstalling(true);
    setInstallMsg(null);
    try {
      const msg = await installSpecialsItem(path, meta.install);
      setInstallMsg(msg);
    } catch (err) {
      setInstallMsg(String(err));
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="specials-item">
      <div className="specials-item__info">
        <span className="specials-item__name">{item.name}</span>
        <span className="specials-item__meta">{fmtSize(item.size)}</span>
        {(error || (failed && job?.error)) && (
          <span className="specials-item__error">{error ?? job?.error}</span>
        )}
        {installMsg && <span className="specials-item__msg">{installMsg}</span>}
        {downloading && (
          <div className="specials-item__bar">
            <div className="specials-item__bar-fill" style={{ width: percent !== null ? `${percent}%` : "40%" }} />
          </div>
        )}
      </div>
      <div className="specials-item__actions">
        {canInstall && (
          <button className="specials-item__install" disabled={!downloaded || installing} onClick={install}>
            {installing ? "Installing…" : "Install"}
          </button>
        )}
        <button className="specials-item__download" disabled={downloading} onClick={download}>
          {downloading ? "Downloading…" : downloaded ? "Re-download" : "Download"}
        </button>
      </div>
    </div>
  );
}
