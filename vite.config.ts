import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Frontend only. The Worker is built by Wrangler; its static assets come from dist/client.
export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist/client", emptyOutDir: true },
  server: { proxy: { "/api": { target: "http://localhost:8787", ws: true } } },
});
