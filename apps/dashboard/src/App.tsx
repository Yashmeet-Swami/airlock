import { useState } from "react";
import { Login } from "./Login.js";
import { LogExplorer } from "./LogExplorer.js";
import { LiveTraffic } from "./LiveTraffic.js";

type View = "logs" | "live";

export function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [view, setView] = useState<View>("logs");

  if (!accessToken) return <Login onLoggedIn={setAccessToken} />;

  return (
    <div>
      <nav>
        <button onClick={() => setView("logs")} disabled={view === "logs"}>
          Log Explorer
        </button>
        <button onClick={() => setView("live")} disabled={view === "live"}>
          Live Traffic
        </button>
      </nav>
      {view === "logs" ? <LogExplorer accessToken={accessToken} /> : <LiveTraffic accessToken={accessToken} />}
    </div>
  );
}
