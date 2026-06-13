import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
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
import "./db.js";

const app = new Hono();

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

// Per-IP abuse limiting on the mutable surfaces.
app.use("/api/auth/*", edgeRateLimit);
app.use("/api/ai/*", edgeRateLimit);

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

// Public mode catalogue (no auth) so the launcher renders before login.
app.get("/api/modes", (c) => c.json({ modes: MODES }));

// Privacy-preserving aggregate metrics (counts only, no content). Gated by a
// token so it isn't world-readable; disabled if ARS_METRICS_TOKEN is unset.
app.get("/api/metrics", (c) => {
  const token = process.env.ARS_METRICS_TOKEN;
  if (!token) return c.json({ error: "disabled" }, 404);
  if (c.req.header("Authorization") !== `Bearer ${token}`) return c.json({ error: "unauthorized" }, 401);
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
serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`ARS Studio server on http://localhost:${info.port} (sharedKey=${hasSharedKey})`);
});

export { app };
