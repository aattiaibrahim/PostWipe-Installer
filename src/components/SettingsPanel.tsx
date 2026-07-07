import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "../lib/tauriCommands";

export function SettingsPanel() {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  async function handleCheckForUpdates() {
    setBusy(true);
    setStatus("Checking for updates…");
    try {
      const update = await check();
      if (!update) {
        setStatus("You're up to date.");
        return;
      }
      setStatus(`Update ${update.version} available — downloading…`);
      await update.downloadAndInstall();
      setStatus("Update installed. Restarting…");
      await relaunch();
    } catch (err) {
      setStatus(`Update check failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-panel">
      <div className="settings-panel__row">
        <button className="settings-panel__check-btn" onClick={handleCheckForUpdates} disabled={busy}>
          {busy ? "Working…" : "Check for Updates"}
        </button>
        {version && <span className="settings-panel__version">Version {version}</span>}
      </div>
      {status && <p className="settings-panel__status">{status}</p>}
    </div>
  );
}
