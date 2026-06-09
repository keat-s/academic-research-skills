import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReference, formatSourcesBlock, type ScholarlyResult } from "./search.js";

const sample: ScholarlyResult = {
  title: "On hallucinated citations",
  authors: ["Jane Zhao", "Wei Li", "Ada Lovelace", "Alan Turing"],
  year: 2026,
  venue: "arXiv",
  doi: "10.1234/abc",
  url: "https://doi.org/10.1234/abc",
  source: "crossref",
  abstract: "We audit 111M references.",
};

test("formatReference collapses >3 authors to et al. and includes DOI", () => {
  const ref = formatReference(sample);
  assert.match(ref, /Jane Zhao et al\./);
  assert.match(ref, /\(2026\)/);
  assert.match(ref, /10\.1234\/abc/);
});

test("formatSourcesBlock numbers sources and warns against fabrication", () => {
  const block = formatSourcesBlock([sample]);
  assert.match(block, /\[S1\]/);
  assert.match(block, /do NOT invent a citation/);
});

test("empty results produce an explicit no-fabrication instruction", () => {
  const block = formatSourcesBlock([]);
  assert.match(block, /no results found/i);
  assert.match(block, /do not fabricate/i);
});
