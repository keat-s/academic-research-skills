import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { timingSafeEqual, createHash } from "node:crypto";
import { MODES } from "@ars/core";
import { env, hasSharedKey } from "./env.js";
import { auth } from "./auth.js";
import { aiRoutes } from "./ai.js";
import { uploadRoutes } from "./uploads.js";
import { exportRoutes } from "./export.js";
import { monetizeRoutes } from "./monetize.js";
import { tipRoutes } from "./tips.js";
import { edgeRateLimit } from "./edge_ratelimit.js";
import { summary } from "./analytics.js";
import { db, stmts, closeDb } from "./db.js";
import { log } from "./logger.js";

/**
 * Constant-time token comparison that is safe against both timing attacks and
 * length-based short-circuits. We hash both sides with SHA-256 first so the
 * buffers are always the same length, which satisfies `timingSafeEqual`'s
 * same-length precondition without revealing information about the secret.
 */
function metricsTokenValid(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const app = new Hono();

// Assign a request id early so every downstream log entry can correlate back
// to the originating request. Honor an incoming `x-request-id` from a trusted
// upstream proxy so the id is preserved end-to-end.
app.use("*", async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const requestId =
    incoming && incoming.length > 0 && incoming.length <= 128
      ? incoming
      : crypto.randomUUID();
  c.set("requestId" as never, requestId);
  c.header("x-request-id", requestId);
  await next();
});

app.use("*", logger());
app.use("*", secureHeaders());
// Global request-size ceiling; the upload route additionally enforces its own
// 8 MB per-file limit after parsing.
app.use("/api/*", bodyLimit({ maxSize: 10 * 1024 * 1024 }));
app.use(
  "*",
  cors({
    origin: env.corsOrigins.includes("*") ? "*" : env.corsOrigins,
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  })
);

// Structured error handler: log with request context and return a clean JSON
// 500 rather than leaking stack traces to clients.
app.onError((err, c) => {
  const requestId = (c.get("requestId" as never) as string | undefined) ?? "unknown";
  log.error("unhandled request error", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    err: err.message,
    stack: err.stack,
  });
  return c.json({ error: "internal_server_error", requestId }, 500);
});

// Per-IP abuse limiting on the mutable surfaces and the metrics endpoint.
app.use("/api/auth/*", edgeRateLimit);
app.use("/api/ai/*", edgeRateLimit);
app.use("/api/metrics", edgeRateLimit);

// Liveness: static, always fast. Kubernetes/Fly.io restarts the pod when this
// returns non-2xx. It deliberately does NOT probe the DB — a slow DB read
// would cause a restart storm; use /api/ready for that.
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    sharedKey: hasSharedKey,
    freeDailyMessages: env.freeDailyMessages,
    features: {
      grounding: true,
      uploads: true,
      export: true,
      localModel: true,
      emailVerification: env.requireEmailVerification,
      supporter: !!env.stripe.supporterPriceId,
    },
  })
);

// Readiness: probes the DB with a cheap SELECT 1. Load balancers / init
// containers should poll this before sending traffic. Returns 503 on failure.
app.get("/api/ready", (c) => {
  try {
    db.prepare("SELECT 1").get();
    return c.json({ ok: true, db: "up" });
  } catch (err) {
    log.error("readiness check failed", { err: err instanceof Error ? err.message : String(err) });
    return c.json({ ok: false, db: "down" }, 503);
  }
});

// Public mode catalogue (no auth) so the launcher renders before login.
app.get("/api/modes", (c) => c.json({ modes: MODES }));

// Which social providers are actually configured — the login page only renders
// a button for a provider whose client id + secret are both set, so users never
// see a button that would error on click. (better-auth registers a provider
// only when configured; this just mirrors that gate to the UI.)
app.get("/api/social-providers", (c) =>
  c.json({
    providers: [
      env.oauth.google.clientId && env.oauth.google.clientSecret ? "google" : null,
      env.oauth.github.clientId && env.oauth.github.clientSecret ? "github" : null,
    ].filter((p): p is string => !!p),
  })
);

// Privacy-preserving aggregate metrics (counts only, no content). Gated by a
// token so it isn't world-readable; disabled if ARS_METRICS_TOKEN is unset.
// The token check uses a SHA-256-based constant-time comparison to avoid
// leaking the expected token via timing side-channels or length short-circuits.
app.get("/api/metrics", (c) => {
  const token = process.env.ARS_METRICS_TOKEN;
  if (!token) return c.json({ error: "disabled" }, 404);
  const authHeader = c.req.header("Authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!metricsTokenValid(provided, token)) return c.json({ error: "unauthorized" }, 401);
  return c.json({ last24h: summary(24 * 60 * 60_000), last7d: summary(7 * 24 * 60 * 60_000) });
});

// better-auth owns the whole /api/auth/* surface (sign-up/in/out, email
// verification, password reset, social callbacks, and — when configured — the
// stripe subscription + webhook endpoints). The bearer plugin returns the
// session token in the `set-auth-token` response header; the web client stores
// it in localStorage and sends it back as `Authorization: Bearer <token>`.
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/api/ai", aiRoutes);
app.route("/api/uploads", uploadRoutes);
app.route("/api/export", exportRoutes);
app.route("/api/monetization", monetizeRoutes);
app.route("/api/tips", tipRoutes);

const port = env.port;
if (process.env.NODE_ENV !== "test") {
  serve({ fetch: app.fetch, port }, (info) => {
    log.info("ARS Studio server started", { port: info.port, sharedKey: hasSharedKey });
  });

  // Prune old analytics events on boot, then every 6 hours. Retains
  // ARS_EVENT_RETENTION_DAYS (default 90) days of data; older rows are cheap
  // to delete because events.created_at is indexed.
  function pruneOldEvents(): void {
    const cutoff = Date.now() - env.eventRetentionDays * 24 * 60 * 60_000;
    try {
      const { changes } = stmts.pruneEvents.run(cutoff);
      if (changes > 0) log.info("pruned old events", { rows: changes, retentionDays: env.eventRetentionDays });
    } catch (err) {
      log.error("event prune failed", { err: err instanceof Error ? err.message : String(err) });
    }
  }
  pruneOldEvents();
  setInterval(pruneOldEvents, 6 * 60 * 60_000).unref();

  // Graceful shutdown: flush the WAL and close SQLite before the process dies.
  // SIGTERM is sent by container runtimes (Docker, Fly.io, k8s); SIGINT is
  // Ctrl-C in dev (but NODE_ENV !== "test" keeps this out of the test runner).
  function shutdown(signal: string): void {
    log.info("shutdown signal received", { signal });
    try {
      closeDb();
    } catch (err) {
      log.error("error during db shutdown", { err: err instanceof Error ? err.message : String(err) });
    }
    process.exit(0);
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Catch-all for async errors that escaped all try/catch handlers.
  process.on("unhandledRejection", (reason) => {
    log.error("unhandledRejection", {
      err: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  // Catch-all for synchronous throws that escaped all try/catch handlers.
  // Log then re-throw so Node's default exit-code behavior is preserved.
  process.on("uncaughtException", (err) => {
    log.error("uncaughtException", { err: err.message, stack: err.stack });
    process.exit(1);
  });
}

export { app };
