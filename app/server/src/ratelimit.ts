import { stmts } from "./db.js";
import { env } from "./env.js";

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface Quota {
  used: number;
  limit: number;
  remaining: number;
}

/**
 * Whether the user has an active "supporter" subscription. This ONLY raises the
 * free daily ceiling — it never gates a core feature (true to the free / CC-BY-NC
 * ethos). Safe when the subscription table is empty / Stripe is unconfigured.
 */
export function isSupporter(userId: string): boolean {
  try {
    return !!stmts.activeSubscription.get(userId, "supporter");
  } catch {
    return false;
  }
}

/** Current free-tier usage for a user (shared-key calls only). */
export function getQuota(userId: string): Quota {
  const row = stmts.getUsage.get(userId, utcDay()) as { count: number } | undefined;
  const used = row?.count ?? 0;
  const limit = isSupporter(userId) ? env.supporterDailyMessages : env.freeDailyMessages;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * Try to consume one shared-key unit. Returns false when the daily free budget
 * is exhausted (the caller should then prompt for BYOK or a tip). The check and
 * increment happen in a single atomic SQL statement (no read-then-write race),
 * which matters the moment the app runs multi-instance / multi-connection.
 */
export function consume(userId: string): boolean {
  const limit = isSupporter(userId) ? env.supporterDailyMessages : env.freeDailyMessages;
  if (!Number.isFinite(limit) || limit <= 0) return false;
  const res = stmts.consumeIfUnder.run(userId, utcDay(), limit);
  return res.changes > 0;
}

/**
 * Refund one shared-key unit previously consumed via consume(). Call only when
 * the upstream stream failed with zero output (provider outage). The UPDATE
 * uses MAX(0, count - 1) so the counter never goes negative. Safe to call on
 * BYOK/Ollama paths (where consume was never called) because the caller is
 * expected to gate on the `quotaConsumed` flag before calling this.
 */
export function refund(userId: string): void {
  stmts.refundUsage.run(userId, utcDay());
}

// --- Generic per-key fixed-window limiter (in-memory) -----------------------
// Used to throttle auth-gated but quota-exempt actions per user (e.g. the
// scholarly /search fan-out and /save writes). Single-node; for multi-instance
// front these with a shared store, same as edge_ratelimit.
const actionBuckets = new Map<string, { count: number; reset: number }>();

export function allowAction(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = actionBuckets.get(key);
  if (!b || b.reset < now) {
    actionBuckets.set(key, { count: 1, reset: now + windowMs });
  } else {
    if (b.count >= max) return false;
    b.count++;
  }
  if (actionBuckets.size > 10_000) {
    for (const [k, v] of actionBuckets) if (v.reset < now) actionBuckets.delete(k);
  }
  return true;
}
