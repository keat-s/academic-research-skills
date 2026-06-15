import { stmts } from "./db.js";
import { log } from "./logger.js";

// Privacy-preserving event logging. We never store message content, prompts,
// or document text here — only coarse counters (what happened, which mode).
export function track(
  name: string,
  opts: { userId?: string | null; modeId?: string | null; meta?: Record<string, unknown> } = {}
): void {
  try {
    stmts.insertEvent.run(
      opts.userId ?? null,
      name,
      opts.modeId ?? null,
      opts.meta ? JSON.stringify(opts.meta).slice(0, 500) : null,
      Date.now()
    );
  } catch (err) {
    // Analytics must never break a request — log the failure and move on.
    log.warn("analytics.track failed", {
      event: name,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export function summary(sinceMs: number): { name: string; n: number }[] {
  try {
    return stmts.eventCounts.all(Date.now() - sinceMs) as { name: string; n: number }[];
  } catch {
    return [];
  }
}
