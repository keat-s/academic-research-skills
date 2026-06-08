// Runtime configuration. All secrets come from the environment; nothing
// sensitive is committed. See app/.env.example.

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  // Dev fallback secret — MUST be overridden in production.
  jwtSecret: required("ARS_JWT_SECRET", "dev-insecure-secret-change-me"),
  // Shared OpenRouter key used to offer free AI to signed-up users.
  // If unset, the app still works in BYOK-only mode.
  openrouterKey: process.env.OPENROUTER_API_KEY ?? "",
  sqlitePath: process.env.ARS_DB_PATH ?? "./data/ars.db",
  // Public URL for OpenRouter analytics headers.
  publicUrl: process.env.ARS_PUBLIC_URL ?? "http://localhost:5173",
  // CORS allowlist (comma-separated). "*" in dev.
  corsOrigins: (process.env.ARS_CORS_ORIGINS ?? "*").split(",").map((s) => s.trim()),
  // Free-tier daily message budget per user when using the shared key.
  freeDailyMessages: Number(process.env.ARS_FREE_DAILY_MESSAGES ?? 40),
} as const;

export const hasSharedKey = env.openrouterKey.length > 0;
