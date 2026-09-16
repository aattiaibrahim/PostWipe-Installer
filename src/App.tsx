import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Browse } from "./screens/Browse";
import { GlassBackdrop } from "./components/GlassBackdrop";
import { TitleBar } from "./components/TitleBar";
import { LaunchSplash } from "./components/LaunchSplash";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { SidebarSettings } from "./components/SidebarSettings";
import { useResizeGlitchGuard } from "./hooks/useResizeGlitchGuard";
import { useApplyTheme } from "./hooks/useApplyTheme";
import { useWindowChrome } from "./hooks/useWindowChrome";
import { useApplyBackdrop } from "./hooks/useApplyBackdrop";
import { hydrateVaultUnlock } from "./state/specialsStore";
import { useHealthStore } from "./state/healthStore";
import { useAccountStore } from "./state/accountStore";
import { AccountDialog } from "./components/AccountDialog";
import { SaveSetDialog } from "./components/SaveSetDialog";
import { isTauri } from "./lib/tauriCommands";
import { playClick } from "./lib/sound";
import "./App.css";
// Loaded after App.css on purpose: it restyles the existing components into the Liquid Glass
// look by overriding them, rather than forking every rule.
import "./liquid-glass.css";
import "./account.css";
import "./home.css";

const CLICKABLE = 'button, [role="button"], a, input[type="checkbox"], .sidebar__item, .os-picker__tile';

const REPO_URL = "https://github.com/aattiaibrahim/PostWipe-Installer";

function openRepo() {
  if (isTauri) {
    openUrl(REPO_URL).catch(() => {});
  } else {
    window.open(REPO_URL, "_blank");
  }
}

function App() {
  useResizeGlitchGuard();
  useApplyTheme();
  useWindowChrome();
  useApplyBackdrop();
  const [splashDone, setSplashDone] = useState(false);

  // Restore a remembered Specials unlock (the vault is locked by default; the padlock in
  // Settings forgets the key, and an app update invalidates it — see specialsStore).
  useEffect(() => {
    void hydrateVaultUnlock();
  }, []);

  // Download-health badges. ONE request for the file the weekly CI sweep publishes — not a
  // live sweep of every vendor, which would take minutes, hammer ~40 sites on every launch
  // and blow through GitHub's 60-req/hour anonymous API cap. The live version is the
  // explicit "Check All Downloads" button in Settings.
  useEffect(() => {
    void useHealthStore.getState().load();
  }, []);

  // Restores a saved session and pulls the account's favorites, sets and settings.
  useEffect(() => {
    void useAccountStore.getState().init();
  }, []);

  // Global click chime. Capture phase so it fires even when a handler stops propagation
  // (e.g. the Specials card checkbox); the store toggle gates whether it plays.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if ((e.target as HTMLElement)?.closest?.(CLICKABLE)) playClick();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <main className="app-shell">
      {!splashDone && <LaunchSplash onDone={() => setSplashDone(true)} />}
      <UpdatePrompt />
      <AccountDialog />
      <SaveSetDialog />
      <SidebarSettings />
      <GlassBackdrop />
      <TitleBar />
      <div className="app-content">
        <Browse />
      </div>
      <footer className="app-footer">
        <button className="app-footer__link" onClick={openRepo} title="Open the GitHub repo">
          Made with <span className="app-footer__heart">❤</span> love
        </button>
      </footer>
    </main>
  );
}

export default App;
