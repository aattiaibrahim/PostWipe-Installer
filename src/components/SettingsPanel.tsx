import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "../lib/tauriCommands";
import { useThemeStore, type Theme } from "../state/themeStore";

const SUN_RAYS =
  "M12 4.5V2.5M12 21.5V19.5M6.34 6.34 4.93 4.93M19.07 19.07 17.66 17.66M4.5 12H2.5M21.5 12H19.5M6.34 17.66 4.93 19.07M19.07 4.93 17.66 6.34";
const SUN_CENTER = "M12 16.5A4.5 4.5 0 1 0 12 7.5A4.5 4.5 0 0 0 12 16.5Z";
const MOON_PATH = "M20 13.2A8.2 8.2 0 0 1 10.8 4A6.8 6.8 0 1 0 20 13.2Z";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="os-picker">
      {THEME_OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            className={`os-picker__tile${active ? " os-picker__tile--active" : ""}`}
            onClick={() => setTheme(opt.value)}
          >
            {active && (
              <motion.div
                className="os-picker__indicator"
                layoutId="theme-toggle-indicator"
                transition={{ type: "spring", stiffness: 700, damping: 46, mass: 0.7 }}
              />
            )}
            <svg
              className="os-picker__icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {opt.value === "light" ? (
                <>
                  <path d={SUN_CENTER} fill="currentColor" stroke="none" />
                  <path d={SUN_RAYS} />
                </>
              ) : (
                <path d={MOON_PATH} fill="currentColor" stroke="none" />
              )}
            </svg>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

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
      <div className="settings-panel__row settings-panel__row--theme">
        <span className="settings-panel__label">Theme</span>
        <ThemeToggle />
      </div>
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
