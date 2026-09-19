import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
import { useEntryHealth } from "../state/healthStore";
import { useAccountStore } from "../state/accountStore";
import { AppIcon } from "./AppIcon";
import { HealthBadge, TrustBadge } from "./HealthBadge";

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

const RING_R = 12;
const RING_C = 2 * Math.PI * RING_R;

/** The App Store's download affordance: a ring that fills with progress, with a stop square in
 *  the middle — clicking it cancels. Spins indeterminately while the size isn't known yet
 *  (queued, resolving the URL, or a server that sends no Content-Length). */
function ProgressRing({ fraction, onCancel, name }: { fraction: number | null; onCancel: () => void; name: string }) {
  const known = fraction !== null;
  return (
    <button
      className={`app-row__ring${known ? "" : " app-row__ring--spin"}`}
      onClick={onCancel}
      aria-label={`Cancel downloading ${name}${known ? ` (${Math.round(fraction * 100)}%)` : ""}`}
      title="Cancel download"
    >
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <circle className="app-row__ring-track" cx="14" cy="14" r={RING_R} />
        <circle
          className="app-row__ring-fill"
          cx="14"
          cy="14"
          r={RING_R}
          strokeDasharray={RING_C}
          strokeDashoffset={known ? RING_C * (1 - fraction) : RING_C * 0.72}
        />
        <rect className="app-row__ring-stop" x="10.5" y="10.5" width="7" height="7" rx="1.5" />
      </svg>
    </button>
  );
}

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
  // Null until a sweep has covered this entry — bookmarks, scripts and freshly added apps
  // simply show no badge rather than an invented status.
  const health = useEntryHealth(app.id, os);
  // Stars only exist for signed-in accounts: a favourite that silently lived on one PC only
  // would defeat the point, which is getting your picks back after the next wipe.
  const signedIn = useAccountStore((s) => s.user !== null);
  const favorite = useAccountStore((s) => s.profile.favorites.includes(app.id));
  const toggleFavorite = useAccountStore((s) => s.toggleFavorite);

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

  // App Store vocabulary: a short "Get" pill; it becomes a progress ring once the download starts.
  const actionLabel = isScript ? (busy ? "Generating…" : "Generate") : busy ? "…" : "Get";
  const progressFraction =
    relevantJob && relevantJob.totalBytes ? Math.min(1, relevantJob.bytesDownloaded / relevantJob.totalBytes) : null;

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
        // deliberately says "+ Start menu", NOT "Pin to Start": the button can't
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

  /* Only a definitive `broken` softens the row. `unknown` deliberately does nothing beyond
     its badge — it usually means the checker got blocked, not that anything is wrong. */
  const isBroken = health?.status === "broken";

  const statusClass = isDownloadingJob
    ? " app-row--downloading"
    : failureMessage
      ? " app-row--failed"
      : isCompleted
        ? " app-row--completed"
        : "";

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  /* Rendered twice — in the grid cell and in the detail sheet — so a download started from
     either place shows its ring in both. */
  const actions = (
    <div className="app-row__action-row">
      {signedIn && (
        <button
          className={`app-row__star${favorite ? " app-row__star--on" : ""}`}
          onClick={() => toggleFavorite(app.id)}
          aria-pressed={favorite}
          aria-label={favorite ? `Remove ${app.name} from favorites` : `Add ${app.name} to favorites`}
          title={favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <svg viewBox="0 0 24 24" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9Z" />
          </svg>
        </button>
      )}
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
          {pinned ? "✓ In Start menu" : "+ Start menu"}
        </button>
      )}
      {isLink ? (
        <button className="app-row__action" onClick={() => siteUrl && openUrl(siteUrl)} title="Open in your browser">
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
        <ProgressRing fraction={progressFraction} onCancel={handleCancel} name={app.name} />
      ) : (
        /* A failed health check mutes the button and renames it, but never disables
           it. Half of the first sweep's "broken" verdicts were the CI runner being
           bot-blocked, and a vendor can fix a link the day after a check — so the
           user always keeps the final say. */
        <button
          className={`app-row__action${isBroken ? " app-row__action--risky" : ""}`}
          disabled={busy}
          onClick={handleClick}
          title={isBroken ? `Last check failed: ${health?.detail ?? ""}` : undefined}
        >
          {isBroken && !busy ? "Get anyway" : actionLabel}
        </button>
      )}
    </div>
  );

  const statusArea = showStatusArea && (
    <div className="app-row__action-status">
      {!isDownloadingJob && failureMessage && <span className="app-row__error">{failureMessage}</span>}
      {!isDownloadingJob && pinError && <span className="app-row__error">{pinError}</span>}
      {!isDownloadingJob && !pinError && pinMsg && <span className="app-row__pin-msg">{pinMsg}</span>}
    </div>
  );

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
        <AppIcon appId={app.id} name={app.name} domain={app.domain} className="app-row__icon" />
        <div className="app-row__body">
          <div className="app-row__name-line">
            <span className="app-row__name">{app.name}</span>
            {!isScript && platform?.stale && (
              <span className="badge badge--stale" title="Needs verification">
                needs check
              </span>
            )}
            {/* Link checks only speak up when a link is actually broken; the everyday mark is
                what the download is verified against (TrustBadge). */}
            <TrustBadge platform={platform} />
            {health?.status === "broken" && <HealthBadge health={health} />}
          </div>
          {app.bio && <p className="app-row__bio">{app.bio}</p>}
        </div>
        <div className="app-row__action-col">
          {/* Select mode (toolbar ▸ Select): the Get pill becomes a circle, like Photos. */}
          {selectMode && selectable ? (
            <button
              className={`select-circle${selected ? " select-circle--on" : ""}`}
              role="checkbox"
              aria-checked={selected}
              aria-label={`Select ${app.name}`}
              onClick={() => toggleSelected(app.id)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 12.5l4 4 8-9" />
              </svg>
            </button>
          ) : (
            actions
          )}
          {statusArea}
        </div>
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
      {/* App Store-style detail sheet: opening it never reflows the grid underneath. */}
      {createPortal(
        <AnimatePresence>
          {expanded && hasDetails && (
            <motion.div
              className="confirm-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setExpanded(false)}
            >
              <motion.div
                className="confirm-dialog app-sheet"
                role="dialog"
                aria-label={app.name}
                onClick={(e) => e.stopPropagation()}
                initial={{ scale: 0.94, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.96, opacity: 0, y: 8 }}
                transition={{ type: "spring", stiffness: 460, damping: 34 }}
              >
                <button className="app-sheet__close" onClick={() => setExpanded(false)} aria-label="Close">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
                <header className="app-sheet__head">
                  <AppIcon appId={app.id} name={app.name} domain={app.domain} className="app-sheet__icon" />
                  <div className="app-sheet__title">
                    <h3 className="app-sheet__name">
                      {app.name} <TrustBadge platform={platform} />
                      {health?.status === "broken" && <HealthBadge health={health} />}
                    </h3>
                    {app.bio && <p className="app-sheet__bio">{app.bio}</p>}
                    <div className="app-sheet__actions">{actions}</div>
                  </div>
                </header>
                {statusArea}
                <div className="app-sheet__body">
                  {app.description && <p className="app-sheet__notes">{app.description}</p>}
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
                    <button className="app-row__link-btn" onClick={() => openUrl(app.website ?? `https://${app.domain}`)}>
                      Visit {app.website ? app.website.replace(/^https?:\/\//, "") : app.domain} ↗
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </motion.div>
  );
});
