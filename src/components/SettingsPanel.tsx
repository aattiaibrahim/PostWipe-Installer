import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { getShareStats, isTauri, setShareStats, startDownload } from "../lib/tauriCommands";
import { useThemeStore, THEMES } from "../state/themeStore";
import { useSettingsStore } from "../state/settingsStore";
import { useSoundStore } from "../state/soundStore";
import { useCatalogStore } from "../state/catalogStore";
import { useSpecialsStore } from "../state/specialsStore";
import { HealthCheckPanel } from "./HealthCheckPanel";
import { nativeBackdropSupported, useBackdropStore } from "../state/backdropStore";
import type { Backdrop } from "../lib/tauriCommands";
import { isMacOS } from "../lib/platform";

/** Swatch grid of every named theme. Each swatch previews the theme's background + accent;
 *  picking one applies it instantly and themeStore persists it across launches. */
function ThemePicker() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="theme-picker">
      {THEMES.map((t) => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            className={`theme-swatch${active ? " theme-swatch--active" : ""}`}
            onClick={() => setTheme(t.id)}
            title={t.label}
            aria-pressed={active}
          >
            <span className="theme-swatch__chip" style={{ backgroundColor: t.swatch[0] }}>
              <span className="theme-swatch__dot" style={{ backgroundColor: t.swatch[1] }} />
              {active && (
                <motion.span
                  className="theme-swatch__ring"
                  layoutId="theme-swatch-ring"
                  transition={{ type: "spring", stiffness: 600, damping: 40 }}
                />
              )}
            </span>
            <span className="theme-swatch__label">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Wallpaper vs. the OS's own see-through blur. Hidden in the browser preview, where there's
 *  no native window to make see-through. */
function BackdropPicker() {
  const backdrop = useBackdropStore((s) => s.backdrop);
  const setBackdrop = useBackdropStore((s) => s.setBackdrop);
  if (!nativeBackdropSupported) return null;
  // The OS draws native blur as a flat colour when the user has transparency turned off
  // system-wide, and the webview reports that switch through this media query.
  const osBlocksTransparency = window.matchMedia("(prefers-reduced-transparency: reduce)").matches;

  const options: { value: Backdrop; label: string }[] = [
    { value: "wallpaper", label: "Wallpaper" },
    { value: "native", label: "See-through" },
  ];

  return (
    <div className="settings-panel__row settings-panel__row--theme">
      <span className="settings-panel__label">Background</span>
      <div className="os-picker backdrop-picker">
        {options.map((opt) => {
          const active = backdrop === opt.value;
          return (
            <button
              key={opt.value}
              className={`os-picker__tile${active ? " os-picker__tile--active" : ""}`}
              onClick={() => setBackdrop(opt.value)}
              aria-pressed={active}
            >
              {active && (
                <motion.div
                  className="os-picker__indicator"
                  layoutId="backdrop-picker-indicator"
                  transition={{ type: "spring", stiffness: 700, damping: 46, mass: 0.7 }}
                />
              )}
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
      <p className="settings-panel__hint">
        {backdrop === "native"
          ? osBlocksTransparency
            ? isMacOS
              ? "“Reduce transparency” is on in System Settings ▸ Accessibility ▸ Display, so macOS draws this as a solid colour."
              : "Windows transparency effects are off, so this shows as a solid colour. Turn them on in Settings ▸ Personalization ▸ Colors."
            : "Blurs your real desktop behind the window. On some PCs this can stutter while you drag or resize."
          : "A backdrop made from your theme's colours. Looks the same on every machine."}
      </p>
    </div>
  );
}

/** Opt-out for the anonymous counts behind Home's "Popular" shelf. The copy says exactly what
 *  is and isn't sent, because "anonymous" alone is a word people have learned to distrust. */
function ShareStatsToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isTauri) return;
    void getShareStats().then(setEnabled);
  }, []);
  if (!isTauri || enabled === null) return null;

  return (
    <div className="settings-panel__row settings-panel__row--theme">
      <label className="settings-panel__toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            const next = e.target.checked;
            setEnabled(next);
            void setShareStats(next).catch(() => setEnabled(!next));
          }}
        />
        <span className="toggle-switch" aria-hidden="true">
          <span className="toggle-switch__knob" />
        </span>
        <span>Share anonymous download counts</span>
      </label>
      <p className="settings-panel__hint">
        Helps rank Popular on Home. Only the app's name and your OS are sent — no account, device ID or IP address is
        stored.
      </p>
    </div>
  );
}

export function SettingsPanel() {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const autoCheckUpdates = useSettingsStore((s) => s.autoCheckUpdates);
  const setAutoCheckUpdates = useSettingsStore((s) => s.setAutoCheckUpdates);
  const soundEnabled = useSoundStore((s) => s.enabled);
  const setSoundEnabled = useSoundStore((s) => s.setEnabled);
  const catalog = useCatalogStore((s) => s.catalog);
  const osFilter = useCatalogStore((s) => s.osFilter);
  const vaultUnlocked = useSpecialsStore((s) => s.unlocked);
  const lockVault = useSpecialsStore((s) => s.lock);
  const [downloadAllStatus, setDownloadAllStatus] = useState<string>("");
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);

  useEffect(() => {
    if (!confirmAllOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmAllOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmAllOpen]);

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

  const downloadAllTargets = catalog
    ? catalog.categories.flatMap((c) => c.apps).filter((app) => app.kind === "download" && app.platforms[osFilter]?.resolver)
    : [];

  async function handleDownloadAll() {
    if (!catalog) return;
    const targets = downloadAllTargets;
    setDownloadAllStatus(`Starting ${targets.length} downloads…`);
    let started = 0;
    for (const app of targets) {
      try {
        await startDownload(app.id, osFilter);
        started++;
      } catch {
        // Individual failures surface on their own rows; keep going.
      }
    }
    setDownloadAllStatus(`Queued ${started} of ${targets.length} downloads.`);
  }

  return (
    <div className="settings-panel">
      <div className="settings-panel__row settings-panel__row--theme">
        <span className="settings-panel__label">Theme</span>
        <ThemePicker />
      </div>
      <BackdropPicker />
      <div className="settings-panel__row">
        <label className="settings-panel__toggle">
          <input
            type="checkbox"
            checked={autoCheckUpdates}
            onChange={(e) => setAutoCheckUpdates(e.target.checked)}
          />
          {/* The real checkbox is visually hidden; this pill + knob is the rendered switch. */}
          <span className="toggle-switch" aria-hidden="true">
            <span className="toggle-switch__knob" />
          </span>
          <span>Automatically check for updates</span>
        </label>
      </div>
      <div className="settings-panel__row">
        <label className="settings-panel__toggle">
          <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
          <span className="toggle-switch" aria-hidden="true">
            <span className="toggle-switch__knob" />
          </span>
          <span>Click sound effects</span>
        </label>
      </div>
      <ShareStatsToggle />
      {/* Only meaningful once the vault is open — the unlock is remembered across launches,
          so this padlock is how you take it back. */}
      {vaultUnlocked && (
        <div className="settings-panel__row">
          <button className="settings-panel__lock-btn" onClick={lockVault} title="Lock the Specials vault">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <span>Lock Specials</span>
          </button>
        </div>
      )}
      <div className="settings-panel__row">
        <button className="settings-panel__check-btn" onClick={handleCheckForUpdates} disabled={busy}>
          {busy ? "Working…" : "Check for Updates"}
        </button>
        {version && <span className="settings-panel__version">Version {version}</span>}
      </div>
      {status && <p className="settings-panel__status">{status}</p>}
      <div className="settings-panel__row settings-panel__row--health">
        <HealthCheckPanel />
      </div>
      <div className="settings-panel__row">
        <button className="settings-panel__download-all" onClick={() => setConfirmAllOpen(true)}>
          Download All Apps
        </button>
      </div>
      {downloadAllStatus && <p className="settings-panel__status">{downloadAllStatus}</p>}
      {/* Portaled to <body> so the fixed overlay centers on the window, not the sidebar dock. */}
      {createPortal(
        <AnimatePresence>
          {confirmAllOpen && (
            <motion.div
              className="confirm-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setConfirmAllOpen(false)}
            >
              <motion.div
                className="confirm-dialog"
                initial={{ scale: 0.92, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 8 }}
                transition={{ type: "spring", stiffness: 460, damping: 34 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="confirm-dialog__title">Download all apps?</h3>
                <p className="confirm-dialog__body">
                  This queues {downloadAllTargets.length} installers for {osFilter === "windows" ? "Windows" : "macOS"} into
                  your PostWipeDownloads folder.
                </p>
                <div className="confirm-dialog__actions">
                  <button className="confirm-dialog__btn" onClick={() => setConfirmAllOpen(false)}>
                    Cancel
                  </button>
                  <button
                    className="confirm-dialog__btn confirm-dialog__btn--primary"
                    onClick={() => {
                      setConfirmAllOpen(false);
                      void handleDownloadAll();
                    }}
                  >
                    Download All
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
