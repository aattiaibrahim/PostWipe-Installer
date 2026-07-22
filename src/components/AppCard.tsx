import { memo, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AppEntry, Os, PlatformEntry } from "../types/catalog";
import {
  startDownload,
  cancelDownload,
  generateScript,
  findGeneratedScript,
  isScriptPinned,
  pinScriptToStartMenu,
  unpinScriptFromStartMenu,
} from "../lib/tauriCommands";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useDownloadQueueStore } from "../state/downloadQueueStore";
import { useSelectionStore } from "../state/selectionStore";
import { useCatalogStore } from "../state/catalogStore";
import { AppIcon } from "./AppIcon";

interface AppCardProps {
  app: AppEntry;
  os: Os;
}

function fallbackUrl(platform: PlatformEntry, domain?: string): string | null {
  const resolver = platform.resolver;
  if (resolver) {
    if (resolver.type === "html" || resolver.type === "html_regex" || resolver.type === "webview") return resolver.page_url;
    if (resolver.type === "github_release") return `https://github.com/${resolver.repo}/releases/latest`;
  }
  return domain ? `https://${domain}` : null;
}

const ACTIVE_STATUSES = new Set(["queued", "resolving", "downloading"]);

/* memo'd: `app` objects come from the once-loaded catalog (stable identity) and `os` is a
   string, so list-level re-renders (search typing, vendor filter) skip unchanged rows and
   only each row's own store subscriptions re-render it. */
export const AppCard = memo(function AppCard({ app, os }: AppCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPath, setGeneratedPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const jobs = useDownloadQueueStore((s) => s.jobs);
  const selected = useSelectionStore((s) => s.selected.includes(app.id));
  const toggleSelected = useSelectionStore((s) => s.toggle);
  const selectMode = useCatalogStore((s) => s.selectMode);

  const platform = app.platforms[os];
  const scriptId = platform?.script_id;

  useEffect(() => {
    if (!scriptId) return;
    isScriptPinned(scriptId)
      .then(setPinned)
      .catch(() => {});
    // A previous session may have already generated this script — without this, "Pin to
    // Startup" stayed disabled until "Generate Script" was clicked again on every fresh
    // launch, even though the file was already sitting in Downloads.
    findGeneratedScript(scriptId)
      .then((path) => {
        if (path) setGeneratedPath(path);
      })
      .catch(() => {});
  }, [scriptId]);

  const isLink = app.kind === "link";
  // Bookmarks carry no platforms — they're valid on every OS.
  if (!isLink && !platform) return null;

  const isScript = app.kind === "script";
  const isPlaceholder = app.kind === "placeholder";
  const hasDetails = !!app.domain || !!app.description;
  // Some vendors (Tidal, Qobuz, MSI Afterburner) block direct/automated downloads, so their
  // catalog entry has no resolver — the action opens the official site instead of downloading.
  const siteOnly = !isScript && !isPlaceholder && !isLink && !platform?.resolver;
  const siteUrl = app.website ?? (app.domain ? `https://${app.domain}` : null);
  // Only real auto-downloadable apps can be batch-selected (not scripts, placeholders, links, site-only).
  const selectable = !isScript && !isPlaceholder && !isLink && !!platform?.resolver;

  const relevantJob = Object.values(jobs)
    .reverse()
    .find((j) => j.appId === app.id);
  const jobStatus = relevantJob?.status;
  const isDownloadingJob = !isScript && !!jobStatus && ACTIVE_STATUSES.has(jobStatus);
  const isCompleted = isScript ? !!generatedPath && !error : jobStatus === "completed";

  const failureMessage = error ?? (jobStatus === "failed" ? (relevantJob?.error ?? null) : null);
  const showFallback = !isScript && !isPlaceholder && !isLink && !!failureMessage;
  const fallback = platform ? fallbackUrl(platform, app.domain) : null;

  async function handleClick() {
    if (isPlaceholder) return;
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

  async function handleCancel() {
    if (relevantJob) await cancelDownload(relevantJob.jobId);
  }

  const actionLabel = isScript ? (busy ? "Generating…" : "Generate Script") : busy ? "Starting…" : "Download";

  async function handleTogglePin() {
    if (!scriptId) return;
    setPinBusy(true);
    setPinError(null);
    setPinMsg(null);
    try {
      if (pinned) {
        await unpinScriptFromStartMenu(scriptId);
        setPinned(false);
      } else if (generatedPath) {
        const lnkPath = await pinScriptToStartMenu(scriptId, generatedPath);
        setPinned(true);
        const lnkName = lnkPath.split("\\").pop()?.replace(/\.lnk$/i, "") ?? app.name;
        // Windows 11 blocks apps from placing Start tiles (E_ACCESSDENIED on the shell
        // verb), so the app opens Explorer with the shortcut selected — the tile is then
        // one right-click away, which is the closest any app can legally get. The UI
        // deliberately says "Add to Start Menu", NOT "Pin to Start": the button can't
        // deliver the tile itself, and promising it read as broken.
        setPinMsg(
          `"${lnkName}" was added to your Start menu — find it by typing its name in Start search. Want it as a tile too? Explorer just opened with the shortcut selected: right-click it ▸ Pin to Start. Done.`,
        );
      }
    } catch (err) {
      setPinError(String(err));
    } finally {
      setPinBusy(false);
    }
  }

  const showStatusArea = (!isDownloadingJob && !!failureMessage) || !!pinError || !!pinMsg;

  const statusClass = isDownloadingJob
    ? " app-row--downloading"
    : failureMessage
      ? " app-row--failed"
      : isCompleted
        ? " app-row--completed"
        : "";

  return (
    <motion.div
      className="app-row-wrapper"
      layout="position"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div
        className={`app-row${statusClass}${selected ? " app-row--selected" : ""}${hasDetails ? " app-row--expandable" : ""}${selectMode && selectable ? " app-row--select-mode" : ""}`}
        onClick={(e) => {
          // The whole row toggles the info panel — but not when the click was really
          // aimed at a control inside it (checkbox, download/pin buttons, links).
          if ((e.target as HTMLElement).closest("button, input, a, label")) return;
          // "Select Multiple Apps" mode: the whole row becomes the checkbox.
          if (selectMode && selectable) {
            toggleSelected(app.id);
            return;
          }
          if (!hasDetails) return;
          setExpanded((x) => !x);
        }}
      >
        <span className="app-row__status-glow" aria-hidden="true" />
        {/* The circle only exists while "Select Multiple Apps" mode is on (or this row is
            already part of a selection) — idle rows stay clean. */}
        {selectable && (selectMode || selected) && (
          <input
            type="checkbox"
            className="app-row__select"
            checked={selected}
            onChange={() => toggleSelected(app.id)}
            aria-label={`Select ${app.name} for batch download`}
          />
        )}
        <AppIcon appId={app.id} name={app.name} domain={app.domain} className="app-row__icon" />
        <div className="app-row__body">
          <div className="app-row__name-line">
            <span className="app-row__name">{app.name}</span>
            {!isScript && platform?.stale && (
              <span className="badge badge--stale" title="Needs verification">
                needs check
              </span>
            )}
            {hasDetails && (
              <button
                className="app-row__expand-toggle"
                onClick={() => setExpanded((e) => !e)}
                aria-label={expanded ? "Hide app info" : "Show app info"}
              >
                <motion.svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  animate={{ rotate: expanded ? 90 : 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <path d="M9 6l6 6-6 6" />
                </motion.svg>
              </button>
            )}
          </div>
          {app.bio && <p className="app-row__bio">{app.bio}</p>}
        </div>
        <div className="app-row__action-col">
          <div className="app-row__action-row">
            {isScript && (
              <button
                className={`app-row__pin-btn${pinned ? " app-row__pin-btn--active" : ""}`}
                disabled={pinBusy || (!pinned && !generatedPath)}
                onClick={handleTogglePin}
                title={
                  !pinned && !generatedPath
                    ? "Generate the script first"
                    : "Adds a shortcut to your Start menu — it only runs when you click it"
                }
              >
                {pinned ? "✓ In Start Menu" : "Add to Start Menu"}
              </button>
            )}
            {isLink ? (
              <button
                className="app-row__action"
                onClick={() => siteUrl && openUrl(siteUrl)}
                title="Open in your browser"
              >
                Open ↗
              </button>
            ) : isPlaceholder ? (
              <button className="app-row__action" disabled title="Waiting on files">
                Coming soon
              </button>
            ) : siteOnly ? (
              <button
                className="app-row__action"
                onClick={() => siteUrl && openUrl(siteUrl)}
                title="This vendor blocks direct downloads — opens their official download page"
              >
                Get from site ↗
              </button>
            ) : isDownloadingJob ? (
              <button className="app-row__action app-row__action--cancel" onClick={handleCancel}>
                Cancel
              </button>
            ) : (
              <button className="app-row__action" disabled={busy} onClick={handleClick}>
                {actionLabel}
              </button>
            )}
          </div>
          {showStatusArea && (
            <div className="app-row__action-status">
              {!isDownloadingJob && failureMessage && <span className="app-row__error">{failureMessage}</span>}
              {!isDownloadingJob && pinError && <span className="app-row__error">{pinError}</span>}
              {!isDownloadingJob && !pinError && pinMsg && <span className="app-row__pin-msg">{pinMsg}</span>}
            </div>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded && hasDetails && (
          <motion.div
            className="app-row__details-collapse"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            style={{ overflow: "hidden" }}
          >
            <div className="app-row__details">
              {app.description && <p className="app-row__details-notes">{app.description}</p>}
              {app.guide && (
                <div className="app-guide">
                  <span className="app-guide__title">{app.guide.title}</span>
                  <ol className="app-guide__steps">
                    {app.guide.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  {app.guide.snippet && (
                    <div className="app-guide__snippet">
                      <div className="app-guide__snippet-head">
                        <span>{app.guide.snippet.label}</span>
                        <button
                          className="app-guide__copy"
                          onClick={() => {
                            navigator.clipboard.writeText(app.guide!.snippet!.code).then(
                              () => setCopied(true),
                              () => setCopied(false),
                            );
                          }}
                        >
                          {copied ? "Copied ✓" : "Copy"}
                        </button>
                      </div>
                      <pre className="app-guide__code">{app.guide.snippet.code}</pre>
                    </div>
                  )}
                </div>
              )}
              {(app.website || app.domain) && (
                <button
                  className="app-row__link-btn"
                  onClick={() => openUrl(app.website ?? `https://${app.domain}`)}
                >
                  Visit {app.website ? app.website.replace(/^https?:\/\//, "") : app.domain} ↗
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
});
