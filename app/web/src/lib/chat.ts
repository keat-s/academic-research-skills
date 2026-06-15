// Pure chat-message helpers extracted from Studio.tsx.
// These have no React or DOM dependencies and are straightforwardly unit-testable.

import type { UiMessage } from "../useChat.js";

/**
 * Split a leading <think>…</think> block (emitted by reasoning models such as
 * DeepSeek-R1 on the free tier) from the visible answer. Handles the still-open
 * case mid-stream so the reasoning panel fills live.
 */
export function splitReasoning(content: string): { reasoning: string | null; body: string } {
  const closed = content.match(/^\s*<think>([\s\S]*?)<\/think>\s*/i);
  if (closed) return { reasoning: (closed[1] ?? "").trim(), body: content.slice(closed[0].length) };
  const open = content.match(/^\s*<think>([\s\S]*)$/i);
  if (open) return { reasoning: (open[1] ?? "").trim(), body: "" };
  return { reasoning: null, body: content };
}

/** Merge consecutive assistant rows (continuations) into single bubbles. */
export function mergeAssistantRuns(rows: { role: "user" | "assistant"; content: string }[]): UiMessage[] {
  const out: UiMessage[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.role === "assistant" && r.role === "assistant") {
      last.content += r.content;
    } else {
      out.push({ role: r.role, content: r.content });
    }
  }
  return out;
}
