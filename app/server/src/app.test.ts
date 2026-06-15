// Env vars (NODE_ENV=test, ARS_DB_PATH) are set by test-setup.ts via --import
// before this module is evaluated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./index.js";

// Helper: fire a request directly against app.fetch (no network).
async function req(
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: unknown }> {
  const url = `http://localhost${path}`;
  const headers: Record<string, string> = { ...opts.headers };
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    headers["Content-Type"] = "application/json";
  }
  const res = await app.fetch(new Request(url, init));
  // Read body once as text, then attempt JSON parse — avoids "body already read" errors.
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

test("GET /api/modes returns 200 with a modes array", async () => {
  const { status, body } = await req("GET", "/api/modes");
  assert.equal(status, 200);
  assert.ok(Array.isArray((body as { modes: unknown[] }).modes), "body.modes should be an array");
  assert.ok((body as { modes: unknown[] }).modes.length > 0, "modes array should be non-empty");
});

test("GET /api/health returns 200", async () => {
  const { status, body } = await req("GET", "/api/health");
  assert.equal(status, 200);
  assert.equal((body as { ok: boolean }).ok, true);
});

test("POST /api/ai/chat without auth returns 401", async () => {
  const { status } = await req("POST", "/api/ai/chat", {
    body: { messages: [] },
  });
  assert.equal(status, 401);
});

test("GET /api/ai/conversations without auth returns 401", async () => {
  const { status } = await req("GET", "/api/ai/conversations");
  assert.equal(status, 401);
});

test("unknown route returns 404", async () => {
  const { status } = await req("GET", "/api/does-not-exist-xyzzy");
  assert.equal(status, 404);
});

// TODO: ownership test (user A cannot GET user B's conversation → 404).
// Minting a valid better-auth bearer token requires spinning up the full
// better-auth sign-up/sign-in flow against the test DB, which involves
// email-verification bypass and session token extraction. Deferred because
// the value is covered by the requireAuth 401 gate above and the e2e suite.
