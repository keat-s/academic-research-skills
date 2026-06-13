import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./auth.js";

test("password hash round-trips", () => {
  const h = hashPassword("correct horse battery staple");
  assert.ok(verifyPassword("correct horse battery staple", h));
  assert.ok(!verifyPassword("wrong password", h));
});

test("hash is salted (two hashes differ)", () => {
  assert.notEqual(hashPassword("same"), hashPassword("same"));
});
