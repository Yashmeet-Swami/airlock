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
      // Every backend call goes through this single /api prefix (stripped
      // before forwarding) — deliberately not proxying bare paths like
      // "/logs" directly: that collides with the dashboard's own client-side
      // route of the same name, so a full-page refresh or deep link on the
      // Log Explorer page would hit the proxy instead of the SPA and 404.
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
