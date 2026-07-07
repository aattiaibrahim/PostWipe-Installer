import { Browse } from "./screens/Browse";
import "./App.css";

function App() {
  return (
    <main className="app-shell">
      <header className="app-shell__header">
        <h1>PostWipe Installer</h1>
      </header>
      <Browse />
    </main>
  );
}

export default App;
