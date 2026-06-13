import { test } from "node:test";
import assert from "node:assert/strict";
import { toHtmlBody, toLatex, toRtf, convert } from "./export.js";

const md = `# Title

Some **bold** and *italic* and \`code\`.

- one
- two

> a quote`;

test("html: headings, list, emphasis", () => {
  const h = toHtmlBody(md);
  assert.match(h, /<h1>Title<\/h1>/);
  assert.match(h, /<strong>bold<\/strong>/);
  assert.match(h, /<li>one<\/li>/);
  assert.match(h, /<blockquote>a quote<\/blockquote>/);
});

test("latex: sections, itemize, textbf, escaping", () => {
  const l = toLatex("# A & B\n\n- x");
  assert.match(l, /\\section\{A \\& B\}/);
  assert.match(l, /\\begin\{itemize\}/);
  assert.match(l, /\\documentclass\{article\}/);
});

test("rtf: bold heading + paragraph, valid header", () => {
  const r = toRtf("# Heading\n\nBody **x**");
  assert.match(r, /^\{\\rtf1/);
  assert.match(r, /\\b\\fs28 Heading/);
});

test("convert dispatches by format", () => {
  assert.equal(convert("hi", "md"), "hi");
  assert.match(convert("# H", "html"), /<h1>H<\/h1>/);
  assert.match(convert("# H", "latex"), /\\section\{H\}/);
});
