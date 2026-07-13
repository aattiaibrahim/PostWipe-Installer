import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Browse } from "./screens/Browse";
import { AmbientBackground } from "./components/AmbientBackground";
import { TitleBar } from "./components/TitleBar";
import { LaunchSplash } from "./components/LaunchSplash";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { SidebarSettings } from "./components/SidebarSettings";
import { useResizeGlitchGuard } from "./hooks/useResizeGlitchGuard";
import { useApplyTheme } from "./hooks/useApplyTheme";
import { isTauri } from "./lib/tauriCommands";
import { playClick } from "./lib/sound";
import "./App.css";

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
  const [splashDone, setSplashDone] = useState(false);

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
      <SidebarSettings />
      <AmbientBackground />
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
