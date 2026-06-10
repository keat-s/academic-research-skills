import { defineConfig, devices } from "@playwright/test";

// E2E suite. Spins up the API (fresh temp SQLite, no shared OpenRouter key —
// the no-key/BYOK error paths are part of what we assert) and the Vite dev
// server, then drives the real app in Chromium.

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command:
        "pnpm --filter ./server exec tsx src/index.ts",
      url: "http://localhost:8787/api/health",
      reuseExistingServer: !process.env.CI,
      env: {
        ARS_JWT_SECRET: "e2e-test-secret",
        ARS_DB_PATH: "/tmp/ars-e2e.db",
        PORT: "8787",
      },
    },
    {
      command: "pnpm --filter ./web dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
