import { useState } from "react";
import type { AppEntry, Os } from "../types/catalog";
import { startDownload, generateScript } from "../lib/tauriCommands";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

interface AppCardProps {
  app: AppEntry;
  os: Os;
}

function iconSrc(app: AppEntry): string {
  return app.domain ? `https://www.google.com/s2/favicons?sz=64&domain=${app.domain}` : `/icons/${app.icon}`;
}

export function AppCard({ app, os }: AppCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPath, setGeneratedPath] = useState<string | null>(null);

  const platform = app.platforms[os];
  if (!platform) return null;

  const isScript = app.kind === "script";
  const verified = !isScript && !platform.stale && !!platform.resolver;
  const scriptId = platform.script_id;

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
    <div className="app-row">
      <img
        className="app-row__icon"
        src={iconSrc(app)}
        alt=""
        onError={(e) => {
          e.currentTarget.src = "/icons/placeholder.svg";
        }}
      />
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
        {error && <p className="app-row__error">{error}</p>}
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
  );
}
