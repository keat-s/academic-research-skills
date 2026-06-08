import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { MODES } from "@ars/core";
import { env, hasSharedKey } from "./env.js";
import { authRoutes } from "./auth.js";
import { aiRoutes } from "./ai.js";
import { monetizeRoutes } from "./monetize.js";
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

app.get("/api/health", (c) =>
  c.json({ ok: true, sharedKey: hasSharedKey, freeDailyMessages: env.freeDailyMessages })
);

// Public mode catalogue (no auth) so the launcher renders before login.
app.get("/api/modes", (c) => c.json({ modes: MODES }));

app.route("/api/auth", authRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api/monetization", monetizeRoutes);

const port = env.port;
serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`ARS Studio server on http://localhost:${info.port} (sharedKey=${hasSharedKey})`);
});

export { app };
