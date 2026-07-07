import { useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export function SettingsPanel() {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

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
      <button className="settings-panel__check-btn" onClick={handleCheckForUpdates} disabled={busy}>
        {busy ? "Working…" : "Check for Updates"}
      </button>
      {status && <p className="settings-panel__status">{status}</p>}
    </div>
  );
}
