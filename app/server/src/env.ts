// Runtime configuration. All secrets come from the environment; nothing
// sensitive is committed. See app/.env.example.

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

/**
 * Parse a numeric env var with fail-fast validation.
 * - If the env var is unset (or empty), the default is returned as-is.
 * - If the env var IS set but parses to a non-finite number (e.g. "4O"),
 *   throws at boot rather than silently propagating NaN.
 * - Optional `min` enforces a lower bound (also throws at boot).
 */
function num(name: string, defaultValue: number, opts: { min?: number } = {}): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid numeric env var ${name}="${raw}": parsed as ${n}`);
  }
  if (opts.min !== undefined && n < opts.min) {
    throw new Error(`Invalid numeric env var ${name}=${n}: must be >= ${opts.min}`);
  }
  return n;
}

export const env = {
  port: num("PORT", 8787, { min: 1 }),
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
  freeDailyMessages: num("ARS_FREE_DAILY_MESSAGES", 40, { min: 0 }),
  // Raised daily budget for active "supporter" subscribers. Never gates a core
  // feature — it only lifts the free ceiling (BYOK still bypasses quota entirely).
  supporterDailyMessages: num("ARS_SUPPORTER_DAILY_MESSAGES", 200, { min: 0 }),
  // Web app base used to build links in emails / OAuth redirects.
  webUrl: process.env.ARS_WEB_URL ?? process.env.ARS_PUBLIC_URL ?? "http://localhost:5173",
  // Public base of THIS server (for OAuth redirect URIs).
  serverUrl: process.env.ARS_SERVER_URL ?? `http://localhost:${process.env.PORT ?? 8787}`,
  // Block chat until the user confirms their email. Off by default (low friction;
  // also meaningless when SMTP is unconfigured).
  requireEmailVerification: (process.env.ARS_REQUIRE_EMAIL_VERIFICATION ?? "false") === "true",
  // Edge abuse limits (per IP).
  ipRateWindowMs: num("ARS_IP_RATE_WINDOW_MS", 60_000, { min: 1 }),
  ipRateMax: num("ARS_IP_RATE_MAX", 120, { min: 1 }),
  // Trust X-Forwarded-For / X-Real-IP for the client IP. Enable ONLY when this
  // server sits behind a reverse proxy that sets these headers. When false
  // (default), the rate limiter keys on the real socket address, which a remote
  // client cannot spoof — otherwise rotating XFF per request defeats the limiter.
  trustProxy: (process.env.ARS_TRUST_PROXY ?? "false") === "true",
  // Per-user limits on the auth-gated but quota-exempt scholarly endpoints
  // (/api/ai/search fans out to 3 external APIs; /api/ai/save writes rows).
  searchRateMax: num("ARS_SEARCH_RATE_MAX", 20, { min: 1 }),
  searchRateWindowMs: num("ARS_SEARCH_RATE_WINDOW_MS", 60_000, { min: 1 }),
  saveRateMax: num("ARS_SAVE_RATE_MAX", 60, { min: 1 }),
  saveRateWindowMs: num("ARS_SAVE_RATE_WINDOW_MS", 60_000, { min: 1 }),
  // Hard ceiling on the per-request scholarly result count (client-supplied).
  searchLimitMax: num("ARS_SEARCH_LIMIT_MAX", 25, { min: 1 }),
  // Aggregate upload-text budget per user (chars). Default 5 MB of text
  // (~5_000_000 chars). Overridable so operators can tighten or loosen the cap.
  uploadBudgetChars: num("ARS_UPLOAD_BUDGET_CHARS", 5_000_000, { min: 1 }),
  // How many days of analytics events to retain. Older rows are pruned on boot
  // (and at a recurring interval) to keep the events table bounded.
  eventRetentionDays: num("ARS_EVENT_RETENTION_DAYS", 90, { min: 1 }),
  // Local model (Ollama) base, used when a request asks for provider "ollama".
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: num("SMTP_PORT", 587, { min: 1 }),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "ARS Studio <noreply@arsstudio.app>",
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
  },
  // Voluntary tip jar (license-safe: tips never unlock anything).
  tips: {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
    currency: process.env.ARS_TIP_CURRENCY ?? "usd",
    // Preset amounts in cents.
    presets: (process.env.ARS_TIP_PRESETS ?? "300,500,1000")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 100),
    // Hosted payment link fallback (Stripe Payment Link / LemonSqueezy / etc).
    paymentLink: process.env.ARS_TIP_PAYMENT_LINK ?? "",
  },
  // Optional "supporter" subscription via @better-auth/stripe. The plugin is
  // only registered when STRIPE_SECRET_KEY + ARS_SUPPORTER_PRICE_ID are set, so
  // boot never fails without Stripe. Supporter never gates a core feature.
  stripe: {
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    supporterPriceId: process.env.ARS_SUPPORTER_PRICE_ID ?? "",
  },
} as const;

// Refuse to boot in production with the dev JWT secret — sessions would be
// forgeable by anyone who has read this source.
if (process.env.NODE_ENV === "production" && env.jwtSecret === "dev-insecure-secret-change-me") {
  throw new Error("ARS_JWT_SECRET must be set to a strong random value in production.");
}

// Refuse to boot in production with a wildcard CORS origin — it would let any
// web origin drive the authenticated API. Set ARS_CORS_ORIGINS to an explicit
// comma-separated allowlist in production.
if (process.env.NODE_ENV === "production" && env.corsOrigins.includes("*")) {
  throw new Error("ARS_CORS_ORIGINS must be an explicit allowlist in production; wildcard '*' is refused.");
}

export const hasSharedKey = env.openrouterKey.length > 0;
