import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Catalog } from "../types/catalog";
import type { DownloadJobState } from "../types/download";
import { useDownloadHistoryStore, type HistoryEntry } from "../state/downloadHistoryStore";
import { useDownloadQueueStore } from "../state/downloadQueueStore";
import {
  cancelDownload,
  deleteDownload,
  downloadFileInfo,
  openDownload,
  openDownloadsFolder,
  type DownloadFileInfo,
} from "../lib/tauriCommands";
import { AppIcon } from "./AppIcon";
import { fmtSize, tileTint } from "./SpecialsCard";
import { PublishVisibleSelectable } from "./SelectMode";
import { InstallRunPanel } from "./InstallRunPanel";

export const ACTIVE_STATUSES = new Set(["queued", "resolving", "downloading"]);

type Filter = "all" | "installers" | "specials";

const MB = 1024 * 1024;

function fmtAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

function fmtEta(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s left`;
  return `${Math.round(seconds / 60)} min left`;
}

/** "…\Rufus.exe" → "EXE"; null when the filename has no real extension to show. */
function fileExt(destPath: string): string | null {
  const base = destPath.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1);
  return ext.length >= 2 && ext.length <= 4 ? ext.toUpperCase() : null;
}

/** The verification line under a card: green ✓ only for an exact checksum match (same rule as
 *  the badges on app names), a shield for a trusted signature, muted text for everything else. */
function Verification({ text }: { text?: string }) {
  if (!text) return <span className="dl-card__verify">Downloaded before verification was added</span>;
  const detail = text.replace(/^(Verified|Unverified): /, "");
  if (text.includes("SHA-256 matches")) {
    return (
      <span className="dl-card__verify dl-card__verify--ok" title={text}>
        ✓ {detail.split(" · ")[0]}
      </span>
    );
  }
  if (text.startsWith("Verified") && /signed by/i.test(text)) {
    return (
      <span className="dl-card__verify dl-card__verify--signed" title={text}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3Z" />
        </svg>
        {detail.charAt(0).toUpperCase() + detail.slice(1)}
      </span>
    );
  }
  return (
    <span className="dl-card__verify" title={text}>
      {detail}
    </span>
  );
}

/** Bytes/sec per job, smoothed from successive progress events. */
function useSpeeds(jobs: DownloadJobState[]) {
  const samples = useRef(new Map<string, { bytes: number; t: number; speed: number }>());
  const speeds = new Map<string, number>();
  const now = performance.now();
  for (const job of jobs) {
    const prev = samples.current.get(job.jobId);
    if (!prev) {
      samples.current.set(job.jobId, { bytes: job.bytesDownloaded, t: now, speed: 0 });
    } else if (job.bytesDownloaded !== prev.bytes && now - prev.t > 250) {
      const instant = ((job.bytesDownloaded - prev.bytes) / (now - prev.t)) * 1000;
      const speed = prev.speed ? prev.speed * 0.7 + instant * 0.3 : instant;
      samples.current.set(job.jobId, { bytes: job.bytesDownloaded, t: now, speed });
    }
    speeds.set(job.jobId, samples.current.get(job.jobId)!.speed);
  }
  return speeds;
}

function ActiveRow({ job, speed, icon }: { job: DownloadJobState; speed: number; icon: React.ReactNode }) {
  const percent = job.totalBytes ? Math.min(100, (job.bytesDownloaded / job.totalBytes) * 100) : null;
  const parts: string[] = [];
  if (job.status !== "downloading") {
    parts.push(job.status === "queued" ? "Waiting…" : "Finding the latest version…");
  } else {
    parts.push(
      job.totalBytes
        ? `${(job.bytesDownloaded / MB).toFixed(1)} MB of ${(job.totalBytes / MB).toFixed(1)} MB`
        : `${(job.bytesDownloaded / MB).toFixed(1)} MB`,
    );
    if (speed > 0) {
      parts.push(`${(speed / MB).toFixed(1)} MB/s`);
      if (job.totalBytes) parts.push(fmtEta((job.totalBytes - job.bytesDownloaded) / speed));
    }
  }
  return (
    <li className="dl-active">
      {icon}
      <div className="dl-active__body">
        <div className="dl-active__top">
          <strong>{job.appName}</strong>
          <span className="dl-active__pct">{percent !== null ? `${Math.round(percent)}%` : ""}</span>
        </div>
        <div className="dl-active__track">
          <motion.div
            className={`dl-active__fill${percent === null ? " dl-active__fill--indeterminate" : ""}`}
            animate={{ width: `${percent ?? 30}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
          />
        </div>
        <span className="dl-active__meta">{parts.join(" · ")}</span>
      </div>
      <button className="dl-btn" onClick={() => cancelDownload(job.jobId)} aria-label={`Cancel ${job.appName} download`}>
        Cancel
      </button>
    </li>
  );
}

/** Design 2 from the downloads rework: a full page in the sidebar instead of a toolbar popover.
 *  What's downloading now on top, then every file still in PostWipeDownloads as cards. */
export function DownloadsPage({ catalog }: { catalog: Catalog }) {
  const entries = useDownloadHistoryStore((s) => s.entries);
  const removeEntry = useDownloadHistoryStore((s) => s.removeEntry);
  const jobs = useDownloadQueueStore((s) => s.jobs);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const appsById = useMemo(
    () => new Map(catalog.categories.flatMap((c) => c.apps).map((a) => [a.id, a])),
    [catalog],
  );
  // Vault items download into PostWipeDownloads/Specials (start_specials_download).
  const isSpecial = (entry: HistoryEntry) => /[\\/]Specials[\\/][^\\/]+$/.test(entry.destPath);

  const activeJobs = Object.values(jobs).filter((j) => ACTIVE_STATUSES.has(j.status));
  const speeds = useSpeeds(activeJobs);

  // Size/date straight from disk; entries whose file is gone (null) aren't listed.
  const [info, setInfo] = useState<Map<string, DownloadFileInfo>>(new Map());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const paths = entries.map((e) => e.destPath);
    downloadFileInfo(paths)
      .then((res) => {
        if (cancelled) return;
        const next = new Map<string, DownloadFileInfo>();
        res.forEach((r, i) => r && next.set(paths[i], r));
        setInfo(next);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [entries]);

  const files = entries.filter((e) => info.has(e.destPath));
  const totalBytes = files.reduce((sum, e) => sum + info.get(e.destPath)!.size, 0);
  const q = search.trim().toLowerCase();
  const shown = files.filter(
    (e) =>
      (filter === "all" || (filter === "specials") === isSpecial(e)) &&
      (!q || e.appName.toLowerCase().includes(q)),
  );

  const icon = (appId: string, name: string, className: string) => {
    const app = appsById.get(appId);
    if (app) return <AppIcon appId={app.id} name={app.name} domain={app.domain} className={className} />;
    return (
      <div className={`app-icon dl-special-tile ${className}`} style={{ color: tileTint(name) }} aria-hidden="true">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  };

  async function run(action: () => Promise<void>) {
    try {
      await action();
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDelete(entry: HistoryEntry) {
    await run(async () => {
      await deleteDownload(entry.destPath);
      removeEntry(entry.destPath);
    });
    setConfirming(null);
  }

  const counts = {
    all: files.length,
    installers: files.filter((e) => !isSpecial(e)).length,
    specials: files.filter((e) => isSpecial(e)).length,
  };

  return (
    <div className="category-panel downloads-page">
      <PublishVisibleSelectable ids="" />
      <header className="store-head downloads-page__head">
        <div>
          <h1 className="store-head__title">Downloads</h1>
          <p className="store-head__sub">
            {files.length} {files.length === 1 ? "file" : "files"} · {fmtSize(totalBytes)} in PostWipeDownloads
          </p>
        </div>
        <button className="dl-btn dl-btn--folder" onClick={() => run(openDownloadsFolder)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
          </svg>
          Open folder
        </button>
      </header>

      {error && <p className="downloads-page__error">Couldn't do that: {error}</p>}

      <InstallRunPanel />

      {activeJobs.length > 0 && (
        <section className="category-panel__section">
          <div className="category-panel__header">
            <h2 className="category-panel__title">In progress</h2>
          </div>
          <ul className="dl-active-list">
            {activeJobs.map((job) => (
              <ActiveRow
                key={job.jobId}
                job={job}
                speed={speeds.get(job.jobId) ?? 0}
                icon={icon(job.appId, job.appName, "dl-active__icon")}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="category-panel__section">
        <div className="downloads-page__bar">
          <div className="dl-segmented" role="tablist">
            {(["all", "installers", "specials"] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                className={`dl-segmented__btn${filter === f ? " dl-segmented__btn--on" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : f === "installers" ? "Installers" : "Specials"}
                <span>{counts[f]}</span>
              </button>
            ))}
          </div>
          <input
            className="dl-search"
            type="search"
            placeholder="Search downloads"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {!loaded ? null : files.length === 0 ? (
          <div className="downloads-page__empty">
            <strong>Nothing downloaded yet</strong>
            <span>Files you download land in PostWipeDownloads and show up here, checked and ready to open.</span>
          </div>
        ) : shown.length === 0 ? (
          <div className="downloads-page__empty">
            <strong>No matches</strong>
            <span>Nothing here fits that filter.</span>
          </div>
        ) : (
          <div className="dl-grid">
            {shown.map((entry) => {
              const meta = info.get(entry.destPath)!;
              const special = isSpecial(entry);
              const ext = fileExt(entry.destPath);
              const kind = special ? "Special" : ext ? `${ext} installer` : "Installer";
              return (
                <article key={entry.destPath} className="dl-card">
                  <div className="dl-card__head">
                    {icon(entry.appId, entry.appName, "dl-card__icon")}
                    <div className="dl-card__title">
                      <strong title={entry.destPath}>{entry.appName}</strong>
                      <span>
                        {kind} · {fmtSize(meta.size)} · {fmtAgo(entry.completedAt || meta.modified)}
                      </span>
                    </div>
                  </div>
                  <Verification text={entry.verification} />
                  <div className="dl-card__actions">
                    {confirming === entry.destPath ? (
                      <>
                        <button className="dl-btn dl-btn--danger" onClick={() => handleDelete(entry)}>
                          Delete file
                        </button>
                        <button className="dl-btn" onClick={() => setConfirming(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="dl-btn dl-btn--primary" onClick={() => run(() => openDownload(entry.destPath))}>
                          Open
                        </button>
                        <button className="dl-btn" onClick={() => run(() => revealItemInDir(entry.destPath))}>
                          Show
                        </button>
                        <button
                          className="dl-btn dl-btn--ghost"
                          onClick={() => setConfirming(entry.destPath)}
                          aria-label={`Delete ${entry.appName} download`}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
