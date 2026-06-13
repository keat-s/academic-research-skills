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
 * is exhausted (the caller should then prompt for BYOK or a tip).
 */
export function consume(userId: string): boolean {
  const { remaining } = getQuota(userId);
  if (remaining <= 0) return false;
  stmts.upsertUsage.run(userId, utcDay());
  return true;
}
