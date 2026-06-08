import { test } from "node:test";
import assert from "node:assert/strict";
import { MODES, getMode, systemPromptFor } from "./modes.js";

test("registry has 25 modes (matches MODE_REGISTRY.md)", () => {
  assert.equal(MODES.length, 25);
});

test("every mode id is unique", () => {
  const ids = new Set(MODES.map((m) => m.id));
  assert.equal(ids.size, MODES.length);
});

test("systemPromptFor includes the core contract + mode instructions", () => {
  const prompt = systemPromptFor("deep-research:lit-review");
  assert.ok(prompt);
  assert.match(prompt!, /copilot, not the pilot/);
  assert.match(prompt!, /annotated\s+bibliography/i);
});

test("unknown mode returns undefined", () => {
  assert.equal(getMode("nope:nope"), undefined);
  assert.equal(systemPromptFor("nope:nope"), undefined);
});

test("conversational modes are the Socratic / pipeline ones", () => {
  const convo = MODES.filter((m) => m.conversational).map((m) => m.id).sort();
  assert.deepEqual(convo, [
    "academic-paper-reviewer:guided",
    "academic-paper:plan",
    "academic-pipeline:pipeline",
    "academic-pipeline:resume",
    "deep-research:socratic",
  ]);
});
