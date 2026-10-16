import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
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
import { useAccountStore } from "../state/accountStore";
import { useHealthStore } from "../state/healthStore";
import { useAccountDialog } from "./AccountDialog";
import { nativeBackdropSupported, useBackdropStore } from "../state/backdropStore";
import type { Backdrop } from "../lib/tauriCommands";
import { isMacOS } from "../lib/platform";
import { OsPicker } from "./OsPicker";
import { VendorToggle } from "./VendorToggle";

/** Which apps the catalog lists. Both start as this computer (detected on launch), so most
 *  people never touch this — it's for prepping downloads for a different machine. */
function AppsShownPicker() {
  const osFilter = useCatalogStore((s) => s.osFilter);
  const vendorFilter = useCatalogStore((s) => s.vendorFilter);
  const system = useCatalogStore((s) => s.system);
  const thisOs = isMacOS ? "macos" : "windows";
  const matchesThisComputer =
    osFilter === thisOs &&
    (osFilter === "macos" || !system || system.cpuVendor === "unknown" || vendorFilter === system.cpuVendor);

  return (
    <div className="settings-panel__row settings-panel__row--theme">
      <span className="settings-panel__label">Apps shown</span>
      <div className="settings-apps-shown">
        <OsPicker />
        {/* Intel/AMD tools are Windows-only; the toggle collapses away for macOS. */}
        <VendorToggle open={osFilter === "windows"} />
      </div>
      <p className="settings-panel__hint">
        {system?.cpuName ? `This computer: ${system.cpuName}. ` : ""}
        {matchesThisComputer
          ? "Showing apps that fit this computer."
          : osFilter === "windows" && vendorFilter === "all"
            ? "Showing Windows apps for every processor."
            : "Showing apps for a different computer than this one."}
      </p>
    </div>
  );
}

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
    { value: "wallpaper", label: "Solid" },
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
          : "A solid background in your theme's colours. Looks the same on every machine."}
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

/** Check for updates → download → relaunch, shared by the Overview card and the Updates tab. */
function useUpdateCheck() {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [upToDate, setUpToDate] = useState(false);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  async function checkNow() {
    setBusy(true);
    setStatus("Checking for updates…");
    try {
      const update = await check();
      if (!update) {
        setUpToDate(true);
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

  return { status, busy, upToDate, version, checkNow };
}

type SettingsTab = "overview" | "appearance" | "apps" | "downloads" | "privacy" | "updates";

const TABS: { id: SettingsTab; label: string; color: string; icon: ReactNode }[] = [
  {
    id: "overview",
    label: "Overview",
    color: "#8e8e93",
    icon: <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />,
  },
  {
    id: "appearance",
    label: "Appearance",
    color: "#5e5ce6",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" />
      </>
    ),
  },
  {
    id: "apps",
    label: "Apps Shown",
    color: "#0a84ff",
    icon: (
      <>
        <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
        <path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
      </>
    ),
  },
  {
    id: "downloads",
    label: "Downloads",
    color: "#30d158",
    icon: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  },
  {
    id: "privacy",
    label: "Privacy",
    color: "#636366",
    icon: <path d="M12 3l7.5 3v5.5c0 4.6-3.2 7.9-7.5 9-4.3-1.1-7.5-4.4-7.5-9V6z" />,
  },
  {
    id: "updates",
    label: "Updates",
    color: "#ff9f0a",
    icon: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  },
];

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <label className="settings-panel__toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
        <span className="toggle-switch" aria-hidden="true">
          <span className="toggle-switch__knob" />
        </span>
      </label>
    </div>
  );
}

/** The Settings window: macOS-style preference tabs across the top, opening on an Overview
 *  dashboard that says how this install is doing (version, download health, this computer,
 *  account) before any switches. Chosen by Andrew from the settings prototypes ("8 with 5"). */
export function SettingsWindow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>("overview");
  const updates = useUpdateCheck();
  const autoCheckUpdates = useSettingsStore((s) => s.autoCheckUpdates);
  const setAutoCheckUpdates = useSettingsStore((s) => s.setAutoCheckUpdates);
  const soundEnabled = useSoundStore((s) => s.enabled);
  const setSoundEnabled = useSoundStore((s) => s.setEnabled);
  const catalog = useCatalogStore((s) => s.catalog);
  const osFilter = useCatalogStore((s) => s.osFilter);
  const system = useCatalogStore((s) => s.system);
  const vaultUnlocked = useSpecialsStore((s) => s.unlocked);
  const lockVault = useSpecialsStore((s) => s.lock);
  const user = useAccountStore((s) => s.user);
  const openAccountDialog = useAccountDialog((s) => s.open);
  const healthReport = useHealthStore((s) => s.report);
  const healthRunning = useHealthStore((s) => s.running);
  const healthDone = useHealthStore((s) => s.done);
  const healthTotal = useHealthStore((s) => s.total);
  const [downloadAllStatus, setDownloadAllStatus] = useState<string>("");
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);

  useEffect(() => {
    if (open) setTab("overview");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      // Only when this window is the top layer; a dialog above it handles its own Esc.
      if (e.key !== "Escape" || document.querySelectorAll(".confirm-overlay").length > 1) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const downloadAllTargets = catalog
    ? catalog.categories.flatMap((c) => c.apps).filter((app) => app.kind === "download" && app.platforms[osFilter]?.resolver)
    : [];

  async function handleDownloadAll() {
    setDownloadAllStatus(`Starting ${downloadAllTargets.length} downloads…`);
    let started = 0;
    for (const app of downloadAllTargets) {
      try {
        await startDownload(app.id, osFilter);
        started++;
      } catch {
        // Individual failures surface on their own rows; keep going.
      }
    }
    setDownloadAllStatus(`Queued ${started} of ${downloadAllTargets.length} downloads.`);
  }

  const healthEntries = (healthReport?.entries ?? []).filter((e) => e.os === osFilter);
  const healthOk = healthEntries.filter((e) => e.status === "ok").length;
  const healthPct = healthEntries.length ? Math.round((healthOk / healthEntries.length) * 100) : null;
  const osName = osFilter === "windows" ? "Windows" : "macOS";

  const cards = [
    {
      key: "version",
      label: "Version",
      color: "#ff9f0a",
      value: updates.version ?? "—",
      sub: updates.upToDate ? "Up to date" : autoCheckUpdates ? "Checks for updates on launch" : "Automatic updates are off",
      action: (
        <button className="settings-btn" onClick={() => void updates.checkNow()} disabled={updates.busy}>
          {updates.busy ? "Checking…" : "Check for updates"}
        </button>
      ),
    },
    {
      key: "health",
      label: "Download health",
      color: "#30d158",
      value: healthRunning ? `${healthDone}/${healthTotal || "?"}` : healthPct === null ? "—" : `${healthPct}%`,
      sub: healthRunning
        ? "Checking every download link…"
        : healthEntries.length
          ? `${healthOk} of ${healthEntries.length} ${osName} links working`
          : "Not checked yet",
      action: (
        <button className="settings-btn" onClick={() => setTab("downloads")}>
          Check links…
        </button>
      ),
    },
    {
      key: "computer",
      label: "This computer",
      color: "#0a84ff",
      value: osName,
      sub: system?.cpuName ? system.cpuName.replace(/\s+\d+-Core Processor$/i, "") : "Detected automatically",
      action: (
        <button className="settings-btn" onClick={() => setTab("apps")}>
          Change…
        </button>
      ),
    },
    {
      key: "account",
      label: "Account",
      color: "#5e5ce6",
      value: user ? "Signed in" : "Signed out",
      sub: user ? `${user.email}${user.twoFactorEnabled ? " · 2FA on" : ""}` : "Sync favorites and sets across PCs",
      action: (
        <button className="settings-btn settings-btn--primary" onClick={() => openAccountDialog(user ? "manage" : "signIn")}>
          {user ? "Manage" : "Sign in"}
        </button>
      ),
    },
  ];

  let body: ReactNode = null;
  switch (tab) {
    case "overview":
      body = (
        <>
          <div className="settings-cards">
            {cards.map((c) => (
              <div key={c.key} className="settings-card">
                <span className="settings-card__label" style={{ color: c.color }}>
                  {c.label}
                </span>
                <strong className="settings-card__value">{c.value}</strong>
                <span className="settings-card__sub">{c.sub}</span>
                <div className="settings-card__action">{c.action}</div>
              </div>
            ))}
          </div>
          <h4 className="settings-group-label">Quick settings</h4>
          <div className="settings-group">
            <div className="settings-row settings-row--stack">
              <div className="settings-row__text">
                <span>Theme</span>
              </div>
              <ThemePicker />
            </div>
            <SwitchRow label="Click sound effects" checked={soundEnabled} onChange={setSoundEnabled} />
            <SwitchRow label="Check for updates automatically" checked={autoCheckUpdates} onChange={setAutoCheckUpdates} />
          </div>
        </>
      );
      break;
    case "appearance":
      body = (
        <>
          <h4 className="settings-group-label">Theme</h4>
          <div className="settings-group settings-group--pad">
            <ThemePicker />
          </div>
          <h4 className="settings-group-label">Window</h4>
          <div className="settings-group settings-group--pad">
            <BackdropPicker />
            {!nativeBackdropSupported && <p className="settings-panel__hint">Background options appear in the desktop app.</p>}
          </div>
          <h4 className="settings-group-label">Sound</h4>
          <div className="settings-group">
            <SwitchRow label="Click sound effects" hint="A soft click on buttons and toggles." checked={soundEnabled} onChange={setSoundEnabled} />
          </div>
        </>
      );
      break;
    case "apps":
      body = (
        <>
          <h4 className="settings-group-label">This computer</h4>
          <div className="settings-group settings-group--pad">
            <AppsShownPicker />
          </div>
        </>
      );
      break;
    case "downloads":
      body = (
        <>
          <h4 className="settings-group-label">Download health</h4>
          <div className="settings-group settings-group--pad">
            <p className="settings-panel__hint settings-panel__hint--lead">
              Resolves and fetches every {osName} download from your own connection, the only test that predicts whether
              yours will work.
            </p>
            <HealthCheckPanel />
          </div>
          <h4 className="settings-group-label">Bulk</h4>
          <div className="settings-group">
            <div className="settings-row">
              <div className="settings-row__text">
                <span>Download all apps</span>
                <small>
                  Queues {downloadAllTargets.length} {osName} installers into PostWipeDownloads.
                </small>
              </div>
              <button className="settings-btn settings-btn--danger" onClick={() => setConfirmAllOpen(true)}>
                Download all…
              </button>
            </div>
          </div>
          {downloadAllStatus && <p className="settings-panel__status">{downloadAllStatus}</p>}
        </>
      );
      break;
    case "privacy":
      body = (
        <>
          <h4 className="settings-group-label">Community</h4>
          <div className="settings-group settings-group--pad">
            <ShareStatsToggle />
            {!isTauri && <p className="settings-panel__hint">Download counts can be changed in the desktop app.</p>}
          </div>
          <h4 className="settings-group-label">Specials vault</h4>
          <div className="settings-group">
            <div className="settings-row">
              <div className="settings-row__text">
                <span>{vaultUnlocked ? "Unlocked on this PC" : "Locked"}</span>
                <small>The vault key is remembered until you lock it again.</small>
              </div>
              {vaultUnlocked && (
                <button className="settings-btn" onClick={lockVault}>
                  Lock Specials
                </button>
              )}
            </div>
          </div>
        </>
      );
      break;
    case "updates":
      body = (
        <>
          <h4 className="settings-group-label">Software update</h4>
          <div className="settings-group">
            <SwitchRow label="Check for updates automatically" hint="Looks for a new version each time the app opens." checked={autoCheckUpdates} onChange={setAutoCheckUpdates} />
            <div className="settings-row">
              <div className="settings-row__text">
                <span>PostWipe Installer {updates.version ?? ""}</span>
                <small>{updates.status || "Updates are signed and install in the background."}</small>
              </div>
              <button className="settings-btn" onClick={() => void updates.checkNow()} disabled={updates.busy}>
                {updates.busy ? "Working…" : "Check now"}
              </button>
            </div>
          </div>
        </>
      );
      break;
  }

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className="confirm-overlay settings-window__overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
          >
            <motion.div
              className="settings-window"
              role="dialog"
              aria-modal="true"
              aria-label="Settings"
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0, y: 6 }}
              transition={{ type: "spring", stiffness: 460, damping: 36 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="settings-window__toolbar" role="tablist" aria-label="Settings sections">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    className={`settings-tab${tab === t.id ? " settings-tab--on" : ""}`}
                    style={{ "--tab-color": t.color } as CSSProperties}
                    onClick={() => setTab(t.id)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {t.icon}
                    </svg>
                    <span>{t.label}</span>
                  </button>
                ))}
                <button className="settings-window__close" onClick={onClose} aria-label="Close settings">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <motion.div
                key={tab}
                className="settings-window__body"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <h3 className="settings-window__title">{TABS.find((t) => t.id === tab)?.label}</h3>
                {body}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
                This queues {downloadAllTargets.length} installers for {osName} into your PostWipeDownloads folder.
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
      </AnimatePresence>
    </>,
    document.body,
  );
}
