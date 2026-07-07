import { useState } from "react";
import { Browse } from "./screens/Browse";
import { SettingsPanel } from "./components/SettingsPanel";
import { AmbientBackground } from "./components/AmbientBackground";
import { TitleBar } from "./components/TitleBar";
import "./App.css";

function App() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <main className="app-shell">
      <AmbientBackground />
      <TitleBar onToggleSettings={() => setShowSettings((s) => !s)} />
      {showSettings && <SettingsPanel />}
      <Browse />
    </main>
  );
}

export default App;
