import { useState } from "react";
import { searchLogs, type LogSearchResult } from "./api.js";

export function LogExplorer({ accessToken }: { accessToken: string }) {
  const [q, setQ] = useState("");
  const [route, setRoute] = useState("");
  const [statusCode, setStatusCode] = useState("");
  const [results, setResults] = useState<LogSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await searchLogs(accessToken, { q, route, status_code: statusCode });
      setResults(res.results);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
  }

  return (
    <div>
      <h1>Log Explorer</h1>
      <form onSubmit={handleSearch}>
        <label>
          q
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="error message / user agent" />
        </label>
        <label>
          route
          <input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="/v1/payments" />
        </label>
        <label>
          status_code
          <input value={statusCode} onChange={(e) => setStatusCode(e.target.value)} placeholder="500" />
        </label>
        <button type="submit">Search</button>
      </form>
      {error && <p>Error: {error}</p>}
      <p>{total} result(s)</p>
      <table border={1} cellPadding={4}>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Route</th>
            <th>Status</th>
            <th>Latency (ms)</th>
            <th>Request ID</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.requestId}>
              <td>{r.timestamp}</td>
              <td>{r.route}</td>
              <td>{r.statusCode ?? "-"}</td>
              <td>{r.latencyMs ?? "-"}</td>
              <td>{r.requestId}</td>
              <td>{r.errorMessage ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
