import { useState } from "react";
import { Browse } from "./screens/Browse";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

function App() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <main className="app-shell">
      <header className="app-shell__header">
        <h1>PostWipe Installer</h1>
        <button className="app-shell__settings-btn" onClick={() => setShowSettings((s) => !s)}>
          Settings
        </button>
      </header>
      {showSettings && <SettingsPanel />}
      <Browse />
    </main>
  );
}

export default App;
