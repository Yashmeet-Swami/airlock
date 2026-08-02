import { useState } from "react";
import { Login } from "./Login.js";
import { LogExplorer } from "./LogExplorer.js";

export function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  if (!accessToken) return <Login onLoggedIn={setAccessToken} />;
  return <LogExplorer accessToken={accessToken} />;
}
