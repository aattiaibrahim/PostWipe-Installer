import { Browse } from "./screens/Browse";
import { AmbientBackground } from "./components/AmbientBackground";
import { TitleBar } from "./components/TitleBar";
import { useResizeGlitchGuard } from "./hooks/useResizeGlitchGuard";
import { useApplyTheme } from "./hooks/useApplyTheme";
import "./App.css";

function App() {
  useResizeGlitchGuard();
  useApplyTheme();

  return (
    <main className="app-shell">
      <AmbientBackground />
      <TitleBar />
      <div className="app-content">
        <Browse />
      </div>
      <footer className="app-footer">Made with ❤ love</footer>
    </main>
  );
}

export default App;
