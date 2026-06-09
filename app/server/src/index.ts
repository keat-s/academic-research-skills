import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { MODES } from "@ars/core";
import { env, hasSharedKey } from "./env.js";
import { authRoutes } from "./auth.js";
import { oauthRoutes } from "./oauth.js";
import { aiRoutes } from "./ai.js";
import { uploadRoutes } from "./uploads.js";
import { exportRoutes } from "./export.js";
import { monetizeRoutes } from "./monetize.js";
import { edgeRateLimit } from "./edge_ratelimit.js";
import { summary } from "./analytics.js";
import "./db.js";

const app = new Hono();

app.use("*", logger());
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

app.route("/api/auth", authRoutes);
app.route("/api/auth/oauth", oauthRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api/uploads", uploadRoutes);
app.route("/api/export", exportRoutes);
app.route("/api/monetization", monetizeRoutes);

const port = env.port;
serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`ARS Studio server on http://localhost:${info.port} (sharedKey=${hasSharedKey})`);
});

export { app };
