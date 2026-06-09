import type { Context, Next } from "hono";
import { env } from "./env.js";

// In-memory fixed-window rate limit per client IP. Cheap abuse protection in
// front of auth + AI routes. For multi-instance deployments, front this with a
// shared store (Redis) or an edge/CDN limiter; this guards the single-node case.

const buckets = new Map<string, { count: number; reset: number }>();

function clientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? "local";
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
