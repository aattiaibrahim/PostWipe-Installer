import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "../lib/tauriCommands";
import { useSettingsStore } from "../state/settingsStore";

/** Checks for updates once on launch (when the auto-check setting is on) and shows a
 *  prompt ONLY if an update actually exists — silent otherwise. */
export function UpdatePrompt() {
  const autoCheckUpdates = useSettingsStore((s) => s.autoCheckUpdates);
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isTauri || !autoCheckUpdates) return;
    let cancelled = false;
    check()
      .then((found) => {
        if (!cancelled && found) setUpdate(found);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Launch-time check only — deliberately not re-run when the setting is toggled later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function install() {
    if (!update) return;
    setInstalling(true);
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch {
      setInstalling(false);
    }
  }

  const visible = !!update && !dismissed;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="update-prompt"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          <span className="update-prompt__text">
            Update <strong>{update?.version}</strong> is available.
          </span>
          <div className="update-prompt__actions">
            <button className="update-prompt__install" onClick={install} disabled={installing}>
              {installing ? "Installing…" : "Install & Restart"}
            </button>
            <button className="update-prompt__later" onClick={() => setDismissed(true)} disabled={installing}>
              Later
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
