import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.DESTINIE_API_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
});
