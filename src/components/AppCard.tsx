import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AppEntry, Os, PlatformEntry } from "../types/catalog";
import { startDownload, generateScript } from "../lib/tauriCommands";
import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
import { useDownloadQueueStore } from "../state/downloadQueueStore";
import { AppIcon } from "./AppIcon";

interface AppCardProps {
  app: AppEntry;
  os: Os;
}

function fallbackUrl(platform: PlatformEntry, domain?: string): string | null {
  const resolver = platform.resolver;
  if (resolver) {
    if (resolver.type === "html") return resolver.page_url;
    if (resolver.type === "github_release") return `https://github.com/${resolver.repo}/releases/latest`;
  }
  return domain ? `https://${domain}` : null;
}

export function AppCard({ app, os }: AppCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPath, setGeneratedPath] = useState<string | null>(null);

  const jobs = useDownloadQueueStore((s) => s.jobs);

  const platform = app.platforms[os];
  if (!platform) return null;

  const isScript = app.kind === "script";
  const verified = !isScript && !platform.stale && !!platform.resolver;
  const scriptId = platform.script_id;

  const failedJob = Object.values(jobs)
    .reverse()
    .find((j) => j.appId === app.id && j.status === "failed");
  const failureMessage = error ?? failedJob?.error ?? null;
  const showFallback = !isScript && !!failureMessage;
  const fallback = fallbackUrl(platform, app.domain);

  async function handleClick() {
    setError(null);
    setBusy(true);
    try {
      if (isScript && scriptId) {
        const path = await generateScript(scriptId);
        setGeneratedPath(path);
      } else if (!isScript) {
        await startDownload(app.id, os);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const actionLabel = isScript ? (busy ? "Generating…" : "Generate Script") : busy ? "Starting…" : "Download";

  return (
    <motion.div
      className="app-row-wrapper"
      layout="position"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="app-row">
        <AppIcon appId={app.id} name={app.name} className="app-row__icon" />
        <div className="app-row__body">
          <div className="app-row__name-line">
            <span className="app-row__name">{app.name}</span>
            {verified && (
              <span className="badge badge--verified" title="Verified good to go">
                ✓ verified
              </span>
            )}
            {!isScript && platform.stale && (
              <span className="badge badge--stale" title={app.notes ?? "Needs verification"}>
                needs check
              </span>
            )}
          </div>
          {app.notes && <p className="app-row__notes">{app.notes}</p>}
          {failureMessage && <p className="app-row__error">{failureMessage}</p>}
          {generatedPath && !error && (
            <p className="app-row__success">
              Saved to {generatedPath}.{" "}
              <button className="app-row__link-btn" onClick={() => revealItemInDir(generatedPath)}>
                Reveal in folder
              </button>
            </p>
          )}
        </div>
        <button className="app-row__action" disabled={busy} onClick={handleClick}>
          {actionLabel}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {showFallback && fallback && (
          <motion.div
            className="app-row__fallback-collapse"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            style={{ overflow: "hidden" }}
          >
            <div className="app-row__fallback">
              Automatic download failed — you can grab it manually instead.{" "}
              <button className="app-row__link-btn" onClick={() => openUrl(fallback)}>
                Open {app.domain ?? "website"} ↗
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
