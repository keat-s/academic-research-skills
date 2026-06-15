/**
 * Structured JSON logger. Zero dependencies — writes `{ts, level, msg, ...fields}`
 * to stdout (info/warn) or stderr (error).
 *
 * Optional error reporter: if `SENTRY_DSN` or `ARS_ERROR_WEBHOOK` is set, a
 * best-effort POST is made for every `log.error` call. No `@sentry/*` package
 * is required — the hook is a plain function that callers can replace.
 */

export type LogLevel = "info" | "warn" | "error";

export type ErrorReporter = (msg: string, fields: Record<string, unknown>) => void;

// Replaceable hook. Default: POST to the webhook URL if configured.
let _reporter: ErrorReporter | null = buildDefaultReporter();

function buildDefaultReporter(): ErrorReporter | null {
  const url = process.env.SENTRY_DSN ?? process.env.ARS_ERROR_WEBHOOK ?? "";
  if (!url) return null;

  return (msg, fields) => {
    // Fire-and-forget — must never throw into the caller.
    const body = JSON.stringify({ ts: new Date().toISOString(), msg, ...fields });
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {
      // Swallow silently: reporter failures must not cascade.
    });
  };
}

/**
 * Replace the error reporter at startup (e.g. wire in a real Sentry client).
 * Pass `null` to disable reporting entirely.
 */
export function setErrorReporter(fn: ErrorReporter | null): void {
  _reporter = fn;
}

function write(level: LogLevel, msg: string, fields: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") {
    process.stderr.write(line + "\n");
    _reporter?.(msg, fields);
  } else {
    process.stdout.write(line + "\n");
  }
}

export const log = {
  info(msg: string, fields: Record<string, unknown> = {}): void {
    write("info", msg, fields);
  },
  warn(msg: string, fields: Record<string, unknown> = {}): void {
    write("warn", msg, fields);
  },
  error(msg: string, fields: Record<string, unknown> = {}): void {
    write("error", msg, fields);
  },
};
