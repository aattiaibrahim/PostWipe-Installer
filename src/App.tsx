import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Browse } from "./screens/Browse";
import { GlassBackdrop } from "./components/GlassBackdrop";
import { TitleBar } from "./components/TitleBar";
import { AlreadyOpenNotice } from "./components/AlreadyOpenNotice";
import { DownloadChoiceSheet } from "./components/DownloadChoiceSheet";
import { useInstallRunner } from "./state/installStore";
import { LaunchSplash } from "./components/LaunchSplash";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { SidebarSettings } from "./components/SidebarSettings";
import { useResizeGlitchGuard } from "./hooks/useResizeGlitchGuard";
import { useApplyTheme } from "./hooks/useApplyTheme";
import { useWindowChrome } from "./hooks/useWindowChrome";
import { useApplyBackdrop } from "./hooks/useApplyBackdrop";
import { hydrateVaultUnlock } from "./state/specialsStore";
import { navigateBack, navigateForward } from "./state/navHistoryStore";
import { useHealthStore } from "./state/healthStore";
import { useAccountStore } from "./state/accountStore";
import { AccountDialog } from "./components/AccountDialog";
import { SaveSetDialog } from "./components/SaveSetDialog";
import { KickstartDialog, useKickstart } from "./components/KickstartDialog";
import { getFlag, isTauri, setFlag } from "./lib/tauriCommands";
import { playClick } from "./lib/sound";
import "./App.css";
// Loaded after App.css on purpose: it restyles the existing components into the Liquid Glass
// look by overriding them, rather than forking every rule.
import "./liquid-glass.css";
import "./account.css";
import "./home.css";
import "./kickstart.css";
// The current look (Golden Gate Store). Loaded last: it overrides everything above.
import "./golden-gate.css";

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
  useInstallRunner();
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

  // First launch only: offer Kickstart once, after the splash, so a new user lands on a
  // guided start instead of a 120-app list. The flag is written the moment it's shown, so
  // closing it without answering still counts — it never nags again.
  useEffect(() => {
    if (!splashDone || !isTauri) return;
    let cancelled = false;
    void getFlag("kickstart-offered").then((offered) => {
      if (cancelled || offered) return;
      void setFlag("kickstart-offered");
      useKickstart.getState().show();
    });
    return () => {
      cancelled = true;
    };
  }, [splashDone]);

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

  // Mouse 4 and 5 go back and forward, as in a browser (navHistoryStore). The DOM numbers
  // them 3 (back) and 4 (forward). Acting on mouseup, the way browsers do; mousedown is
  // swallowed too so the webview never tries a navigation of its own.
  useEffect(() => {
    const isSideButton = (e: MouseEvent) => e.button === 3 || e.button === 4;
    function onDown(e: MouseEvent) {
      if (isSideButton(e)) e.preventDefault();
    }
    function onUp(e: MouseEvent) {
      if (!isSideButton(e)) return;
      e.preventDefault();
      if (e.button === 3) navigateBack();
      else navigateForward();
    }
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("mouseup", onUp, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("mouseup", onUp, true);
    };
  }, []);

  return (
    <main className="app-shell">
      {!splashDone && <LaunchSplash onDone={() => setSplashDone(true)} />}
      <UpdatePrompt />
      <AlreadyOpenNotice />
      <AccountDialog />
      <SaveSetDialog />
      <DownloadChoiceSheet />
      <KickstartDialog />
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
