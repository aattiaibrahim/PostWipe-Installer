import { Browse } from "./screens/Browse";
import { AmbientBackground } from "./components/AmbientBackground";
import { TitleBar } from "./components/TitleBar";
import "./App.css";

function App() {
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
