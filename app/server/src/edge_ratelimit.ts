import type { Context, Next } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { env } from "./env.js";

// In-memory fixed-window rate limit per client IP. Cheap abuse protection in
// front of auth + AI routes. For multi-instance deployments, front this with a
// shared store (Redis) or an edge/CDN limiter; this guards the single-node case.

const buckets = new Map<string, { count: number; reset: number }>();

function clientIp(c: Context): string {
  // Only trust client-supplied forwarding headers when explicitly configured to
  // sit behind a trusted proxy. Otherwise a remote caller can rotate
  // X-Forwarded-For per request and land in a fresh bucket every time, fully
  // neutralizing this limiter (the only abuse guard on /api/auth/* and /api/ai/*).
  if (env.trustProxy) {
    const fwd = c.req.header("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim();
    const real = c.req.header("x-real-ip");
    if (real) return real.trim();
  }
  // Unspoofable: the real TCP peer address from the Node socket.
  // c.env is only populated by @hono/node-server; when app.fetch is called
  // directly (e.g. in tests) it is undefined — fall back to "local" safely.
  const socket = (c.env as HttpBindings | undefined)?.incoming?.socket;
  return socket?.remoteAddress ?? "local";
}

export async function edgeRateLimit(c: Context, next: Next) {
  const ip = clientIp(c);
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.reset < now) {
    buckets.set(ip, { count: 1, reset: now + env.ipRateWindowMs });
  } else {
    b.count++;
    if (b.count > env.ipRateMax) {
      const retry = Math.ceil((b.reset - now) / 1000);
      c.header("Retry-After", String(retry));
      return c.json({ error: "rate_limited", message: "Too many requests. Slow down." }, 429);
    }
  }
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  }
  await next();
}
