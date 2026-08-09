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
      "/auth": apiProxyTarget,
      "/logs": apiProxyTarget,
      "/admin": apiProxyTarget,
      "/analytics": apiProxyTarget,
      // SSE — needs to stay unbuffered; Vite's proxy streams by default.
      "/realtime": apiProxyTarget,
    },
  },
});
