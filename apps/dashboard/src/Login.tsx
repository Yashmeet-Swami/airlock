import { useState } from "react";
import { login } from "./api.js";

export function Login({ onLoggedIn }: { onLoggedIn: (accessToken: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await login(email, password);
      onLoggedIn(res.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div>
      <h1>Airlock — Log In</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
        </div>
        <div>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
        </div>
        <button type="submit">Log in</button>
      </form>
      {error && <p>Error: {error}</p>}
    </div>
  );
}
