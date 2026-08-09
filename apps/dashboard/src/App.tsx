import { useState } from "react";
import { Login } from "./Login.js";
import { LogExplorer } from "./LogExplorer.js";
import { LiveTraffic } from "./LiveTraffic.js";

type View = "logs" | "live";

const ACCESS_TOKEN_STORAGE_KEY = "airlock.accessToken";

export function App() {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY),
  );
  const [view, setView] = useState<View>("logs");

  function handleLoggedIn(token: string) {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    setAccessToken(token);
  }

  function handleLogOut() {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    setAccessToken(null);
  }

  if (!accessToken) return <Login onLoggedIn={handleLoggedIn} />;

  return (
    <div>
      <nav>
        <button onClick={() => setView("logs")} disabled={view === "logs"}>
          Log Explorer
        </button>
        <button onClick={() => setView("live")} disabled={view === "live"}>
          Live Traffic
        </button>
        <button onClick={handleLogOut}>Log out</button>
      </nav>
      {view === "logs" ? <LogExplorer accessToken={accessToken} /> : <LiveTraffic accessToken={accessToken} />}
    </div>
  );
}
