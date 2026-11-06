import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

const localProxy: ProxyOptions = {
  target: "http://127.0.0.1:8790",
  changeOrigin: true,
  configure(proxy) {
    proxy.on("proxyReq", (outgoing, incoming) => {
      if (incoming.headers.origin === `http://${incoming.headers.host}`) outgoing.setHeader("Origin", "http://127.0.0.1:8790");
    });
  },
};

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false },
  server: {
    host: "127.0.0.1",
    fs: { deny: [".env", ".env.*", "*.pem", "**/.git/**", "**/.dev.vars", "**/.local/**", "**/.wrangler/**"] },
    proxy: { "/v1": localProxy, "/health": localProxy },
  },
});
