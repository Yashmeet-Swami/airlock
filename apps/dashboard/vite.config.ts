import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Proxies API calls to the gateway so no CORS config is needed for local dev.
// Target differs between running on the host (gateway on localhost) and
// inside Docker Compose (service name).
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      // Every backend call goes through this single /api/ prefix (stripped
      // before forwarding). Deliberately not proxying bare paths like "/logs"
      // directly: that collides with the dashboard's own client-side route of
      // the same name, so a full-page refresh/deep link 404s instead of
      // loading the SPA. The trailing slash matters just as much as the
      // prefix itself — Vite's proxy match is a plain string-prefix check, so
      // a bare "/api" key would *also* swallow the dashboard's own
      // "/api-keys" route (it really did, until this was caught rendering
      // that page's screenshot). "/api/" can never prefix-match a route name
      // that doesn't itself contain a literal slash at that position.
      "/api/": {
        target: apiProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
