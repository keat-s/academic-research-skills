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
  // Raised daily budget for active "supporter" subscribers. Never gates a core
  // feature — it only lifts the free ceiling (BYOK still bypasses quota entirely).
  supporterDailyMessages: Number(process.env.ARS_SUPPORTER_DAILY_MESSAGES ?? 200),
  // Web app base used to build links in emails / OAuth redirects.
  webUrl: process.env.ARS_WEB_URL ?? process.env.ARS_PUBLIC_URL ?? "http://localhost:5173",
  // Public base of THIS server (for OAuth redirect URIs).
  serverUrl: process.env.ARS_SERVER_URL ?? `http://localhost:${process.env.PORT ?? 8787}`,
  // Block chat until the user confirms their email. Off by default (low friction;
  // also meaningless when SMTP is unconfigured).
  requireEmailVerification: (process.env.ARS_REQUIRE_EMAIL_VERIFICATION ?? "false") === "true",
  // Edge abuse limits (per IP).
  ipRateWindowMs: Number(process.env.ARS_IP_RATE_WINDOW_MS ?? 60_000),
  ipRateMax: Number(process.env.ARS_IP_RATE_MAX ?? 120),
  // Local model (Ollama) base, used when a request asks for provider "ollama".
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
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

export const hasSharedKey = env.openrouterKey.length > 0;
