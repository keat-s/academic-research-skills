import { test } from "node:test";
import assert from "node:assert/strict";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// The custom JWT auth module was replaced by better-auth (auth.ts now exports the
// better-auth instance + a requireAuth middleware). The one auth detail we still
// own is the legacy scrypt password format "<saltHex>:<hashHex>", overridden into
// better-auth's emailAndPassword.password.{hash,verify} so migrated users keep
// logging in. These tests lock that exact format so a future change can't silently
// break existing credentials.

function legacyHash(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
function legacyVerify(stored: string, pw: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = scryptSync(pw, salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  return keyBuf.length === derived.length && timingSafeEqual(keyBuf, derived);
}

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
