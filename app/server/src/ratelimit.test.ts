// Env vars (NODE_ENV=test, ARS_DB_PATH, ARS_FREE_DAILY_MESSAGES=3) are set by
// test-setup.ts via --import before this module is evaluated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { consume, getQuota } from "./ratelimit.js";

/** Insert a minimal user row so the usage_daily FK is satisfied. */
function seedUser(id: string) {
  const now = Date.now();
  db.prepare(
    "INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)"
  ).run(id, "Test User", `${id}@test.local`, now, now);
}

test("consume returns true up to the limit and false beyond", () => {
  const userId = randomUUID();
  seedUser(userId);

  // Limit is 3 (ARS_FREE_DAILY_MESSAGES=3 set in test-setup.ts).
  assert.equal(consume(userId), true,  "1st call should succeed");
  assert.equal(consume(userId), true,  "2nd call should succeed");
  assert.equal(consume(userId), true,  "3rd call should succeed");
  assert.equal(consume(userId), false, "4th call should be rejected");
  assert.equal(consume(userId), false, "5th call should still be rejected");
});

test("stored count never exceeds the limit", () => {
  const userId = randomUUID();
  seedUser(userId);

  // Drive past the limit.
  for (let i = 0; i < 10; i++) consume(userId);

  const today = new Date().toISOString().slice(0, 10);
  const row = db
    .prepare("SELECT count FROM usage_daily WHERE user_id = ? AND day = ?")
    .get(userId, today) as { count: number } | undefined;

  assert.ok(row, "usage_daily row should exist");
  assert.equal(row!.count, 3, "count must not exceed limit=3");
});

test("getQuota reflects consumed units", () => {
  const userId = randomUUID();
  seedUser(userId);

  assert.equal(getQuota(userId).remaining, 3);
  consume(userId);
  consume(userId);
  assert.equal(getQuota(userId).used, 2);
  assert.equal(getQuota(userId).remaining, 1);
});

test("two users are independent (one exhausted, the other still has budget)", () => {
  const userA = randomUUID();
  const userB = randomUUID();
  seedUser(userA);
  seedUser(userB);

  // Exhaust A.
  consume(userA);
  consume(userA);
  consume(userA);
  assert.equal(consume(userA), false, "A should be exhausted");

  // B is untouched.
  assert.equal(consume(userB), true, "B should still have budget");
});
