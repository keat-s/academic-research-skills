import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const API_TARGET = process.env.VITE_API_PROXY ?? "http://localhost:8787";

// Build-time guard: a packaged target (Capacitor / Tauri) loads from
// capacitor://localhost or tauri://localhost, so a relative VITE_API_BASE
// ("/api") resolves against that shell origin and every API call 404s. When a
// packaged build is requested (ARS_PACKAGED_TARGET set by the CI step), require
// an absolute API origin and fail the build loudly otherwise.
const API_BASE = process.env.VITE_API_BASE;
const PACKAGED_TARGET = process.env.ARS_PACKAGED_TARGET; // "capacitor" | "tauri"
if (PACKAGED_TARGET && (!API_BASE || API_BASE.startsWith("/"))) {
  throw new Error(
    `[vite] Building for packaged target "${PACKAGED_TARGET}" requires an absolute ` +
      `VITE_API_BASE (got "${API_BASE ?? "unset"}"). A relative base resolves to ` +
      `${PACKAGED_TARGET}://localhost inside the app shell and every API call 404s. ` +
      `Set VITE_API_BASE to your hosted API origin, e.g. https://api.example.com.`
  );
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "ARS Studio",
        short_name: "ARS Studio",
        description:
          "AI-native academic research, writing, and review — free, built on the Academic Research Skills suite.",
        theme_color: "#FBFBF9",
        background_color: "#FBFBF9",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // The WebLLM engine is a large, on-demand chunk — don't precache it
        // (it's lazy-loaded only when a user picks the in-browser backend).
        globIgnores: ["**/webllm-engine*.js"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Pin the WebLLM engine to a stable chunk name so the service worker
        // can reliably exclude it from precache.
        manualChunks(id) {
          if (id.includes("@mlc-ai/web-llm")) return "webllm-engine";
        },
      },
    },
  },
});
