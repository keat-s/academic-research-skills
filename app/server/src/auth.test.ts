// Env vars (NODE_ENV=test, ARS_DB_PATH) are set by test-setup.ts via --import
// before this module is evaluated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyHash, legacyVerify } from "./auth.js";

// These tests lock the legacy scrypt password format "<saltHex>:<hashHex>" that
// is overridden into better-auth's emailAndPassword.password.{hash,verify}.
// Migrated users must keep logging in after the better-auth adoption — changing
// this format locks them out silently, so we pin it here.

test("legacy scrypt password hash round-trips", () => {
  const h = legacyHash("correct horse battery staple");
  assert.ok(legacyVerify(h, "correct horse battery staple"));
  assert.ok(!legacyVerify(h, "wrong password"));
});

test("legacy hash is salted (two hashes differ)", () => {
  assert.notEqual(legacyHash("same"), legacyHash("same"));
});

test("legacy hash format is <saltHex>:<hashHex> with 64-byte key", () => {
  const h = legacyHash("hunter2");
  const [salt, key] = h.split(":");
  assert.equal(salt.length, 32); // 16 bytes hex
  assert.equal(key.length, 128); // 64 bytes hex
});

test("legacyVerify rejects malformed stored value (no colon)", () => {
  assert.equal(legacyVerify("notavalidhash", "anything"), false);
});
