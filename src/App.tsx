import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Browse } from "./screens/Browse";
import { AmbientBackground } from "./components/AmbientBackground";
import { TitleBar } from "./components/TitleBar";
import { LaunchSplash } from "./components/LaunchSplash";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { SelectionBar } from "./components/SelectionBar";
import { useResizeGlitchGuard } from "./hooks/useResizeGlitchGuard";
import { useApplyTheme } from "./hooks/useApplyTheme";
import { isTauri } from "./lib/tauriCommands";
import "./App.css";

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

  return (
    <main className="app-shell">
      {!splashDone && <LaunchSplash onDone={() => setSplashDone(true)} />}
      <UpdatePrompt />
      <SelectionBar />
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
