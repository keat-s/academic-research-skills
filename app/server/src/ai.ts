import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { randomUUID } from "node:crypto";
import {
  systemPromptFor,
  streamChat,
  streamOllama,
  listOllamaModels,
  fetchFreeModels,
  searchScholarly,
  DEFAULT_FREE_MODELS,
  DEFAULT_MODEL,
  type ChatMessage,
} from "@ars/core";
import { env, hasSharedKey } from "./env.js";
import { stmts } from "./db.js";
import { requireAuth } from "./auth.js";
import { consume, getQuota, allowAction } from "./ratelimit.js";
import { ground } from "./grounding.js";
import { loadUploadTexts } from "./uploads.js";
import { track } from "./analytics.js";
import type { Env } from "./types.js";

export const aiRoutes = new Hono<Env>();
aiRoutes.use("*", requireAuth);

// Cache the live free-model list briefly to avoid hammering OpenRouter.
let modelCache: { at: number; data: typeof DEFAULT_FREE_MODELS } | null = null;

aiRoutes.get("/models", async (c) => {
  if (!hasSharedKey) return c.json({ models: DEFAULT_FREE_MODELS, sharedKey: false });
  const now = Date.now();
  if (!modelCache || now - modelCache.at > 5 * 60_000) {
    const data = await fetchFreeModels({
      apiKey: env.openrouterKey,
      referer: env.publicUrl,
      title: "ARS Studio",
    }).catch(() => DEFAULT_FREE_MODELS);
    modelCache = { at: now, data };
  }
  return c.json({ models: modelCache.data, sharedKey: true });
});

aiRoutes.get("/local-models", async (c) => {
  const models = await listOllamaModels(env.ollamaUrl);
  return c.json({ models, available: models.length > 0, base: env.ollamaUrl });
});

// Scholarly retrieval only (no LLM, no quota). Powers citation grounding for
// the in-browser WebLLM path, where generation happens client-side.
aiRoutes.post("/search", async (c) => {
  const userId = c.get("userId") as string;
  if (!allowAction(`search:${userId}`, env.searchRateMax, env.searchRateWindowMs)) {
    c.header("Retry-After", String(Math.ceil(env.searchRateWindowMs / 1000)));
    return c.json({ error: "rate_limited", message: "Too many searches. Slow down." }, 429);
  }
  const body = await c.req.json().catch(() => ({}));
  const query = String(body.query ?? "").trim();
  if (!query) return c.json({ sources: [] });
  // Clamp the client-supplied result count: it drives a 3-provider external
  // fan-out, so an unbounded value is an amplification vector.
  const reqLimit = Number(body.limit);
  const limit = Math.min(env.searchLimitMax, Math.max(1, Number.isFinite(reqLimit) ? reqLimit : 6));
  const sources = await searchScholarly(query.slice(0, 300), { limit });
  return c.json({ sources });
});

// Persist a completed exchange produced client-side (WebLLM). No quota: the
// user's own device did the inference.
aiRoutes.post("/save", async (c) => {
  const userId = c.get("userId") as string;
  if (!allowAction(`save:${userId}`, env.saveRateMax, env.saveRateWindowMs)) {
    c.header("Retry-After", String(Math.ceil(env.saveRateWindowMs / 1000)));
    return c.json({ error: "rate_limited", message: "Too many writes. Slow down." }, 429);
  }
  const body = (await c.req.json().catch(() => null)) as
    | { conversationId?: string; modeId: string; userText: string; assistantText: string }
    | null;
  if (!body || !body.modeId || typeof body.assistantText !== "string") {
    return c.json({ error: "bad_request" }, 400);
  }
  let conversationId = body.conversationId;
  const now = Date.now();
  if (!conversationId) {
    conversationId = randomUUID();
    const title = (body.userText || "New chat").slice(0, 80);
    stmts.insertConversation.run(conversationId, userId, body.modeId, title, now, now);
  } else if (!stmts.conversationById.get(conversationId, userId)) {
    return c.json({ error: "not_found" }, 404);
  }
  if (body.userText) {
    stmts.insertMessage.run(randomUUID(), conversationId, "user", body.userText, now);
  }
  stmts.insertMessage.run(randomUUID(), conversationId, "assistant", body.assistantText, now + 1);
  stmts.touchConversation.run(now + 1, conversationId);
  track("chat", { userId, modeId: body.modeId, meta: { provider: "webllm" } });
  return c.json({ conversationId });
});

aiRoutes.get("/quota", (c) => {
  const userId = c.get("userId") as string;
  return c.json(getQuota(userId));
});

// --- conversation persistence ---
aiRoutes.get("/conversations", (c) => {
  const userId = c.get("userId") as string;
  return c.json({ conversations: stmts.conversationsByUser.all(userId) });
});

aiRoutes.get("/conversations/:id", (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  const conv = stmts.conversationById.get(id, userId);
  if (!conv) return c.json({ error: "not_found" }, 404);
  return c.json({ conversation: conv, messages: stmts.messagesByConversation.all(id) });
});

// Truncate a conversation at its k-th user message (1-based): that message and
// everything after it are deleted. Powers edit-and-resend and regenerate.
aiRoutes.post("/conversations/:id/truncate", async (c) => {
  const userId = c.get("userId") as string;
  const id = c.req.param("id");
  if (!stmts.conversationById.get(id, userId)) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const k = Math.floor(Number(body.fromUserTurn));
  if (!Number.isFinite(k) || k < 1) return c.json({ error: "bad_request" }, 400);
  const anchor = stmts.kthUserMessageAt.get(id, k - 1) as { created_at: number } | undefined;
  if (anchor) {
    stmts.deleteMessagesFrom.run(id, anchor.created_at);
    stmts.touchConversation.run(Date.now(), id);
  }
  return c.json({ ok: true });
});

aiRoutes.delete("/conversations/:id", (c) => {
  const userId = c.get("userId") as string;
  stmts.deleteConversation.run(c.req.param("id"), userId);
  return c.json({ ok: true });
});

interface ChatBody {
  modeId: string;
  conversationId?: string;
  messages: ChatMessage[];
  model?: string;
  apiKey?: string; // BYOK
  temperature?: number;
  grounding?: boolean; // run the scholarly-search citation pre-pass
  uploadIds?: string[]; // attach extracted text from prior uploads
  provider?: "openrouter" | "ollama"; // "ollama" routes to a local model
  // True for continuation turns ("continue where you left off") — the synthetic
  // user instruction should not be persisted into history.
  skipUserPersist?: boolean;
}

/**
 * Streaming chat. Injects the mode's system prompt, enforces the free-tier
 * quota for shared-key calls (BYOK bypasses it), streams deltas as SSE, and
 * persists the exchange.
 */
aiRoutes.post("/chat", async (c) => {
  const userId = c.get("userId") as string;
  const body = (await c.req.json().catch(() => null)) as ChatBody | null;
  if (!body || !body.modeId || !Array.isArray(body.messages)) {
    return c.json({ error: "bad_request" }, 400);
  }

  const system = systemPromptFor(body.modeId);
  if (!system) return c.json({ error: "unknown_mode" }, 400);

  const usingLocal = body.provider === "ollama";
  const usingByok = typeof body.apiKey === "string" && body.apiKey.length > 0;
  const apiKey = usingByok ? body.apiKey! : env.openrouterKey;

  // Local (Ollama) inference is the user's own compute — no key, no quota.
  if (!usingLocal && !usingByok) {
    if (!hasSharedKey) {
      return c.json({ error: "no_shared_key", message: "Add your own OpenRouter key to chat." }, 402);
    }
    if (!consume(userId)) {
      return c.json(
        { error: "quota_exhausted", message: "Daily free limit reached. Add your own key or come back tomorrow." },
        429
      );
    }
  }
  track("chat", { userId, modeId: body.modeId, meta: { grounding: !!body.grounding, provider: body.provider ?? "openrouter" } });

  const model = body.model || DEFAULT_MODEL;
  const messages: ChatMessage[] = [{ role: "system", content: system }, ...body.messages];

  // Attach extracted text from uploaded documents (kept server-side).
  if (Array.isArray(body.uploadIds) && body.uploadIds.length > 0) {
    const docs = loadUploadTexts(userId, body.uploadIds);
    if (docs.length > 0) {
      const block = docs
        .map((d) => `--- DOCUMENT: ${d.filename} ---\n${d.text}`)
        .join("\n\n");
      messages.splice(1, 0, {
        role: "system",
        content: `The user attached the following document(s). Use them as the primary material:\n\n${block}`,
      });
    }
  }

  // Ensure a conversation row exists, persist the latest user turn.
  let conversationId = body.conversationId;
  const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
  if (!conversationId) {
    conversationId = randomUUID();
    const title = (lastUser?.content ?? "New chat").slice(0, 80);
    const now = Date.now();
    stmts.insertConversation.run(conversationId, userId, body.modeId, title, now, now);
  } else {
    // Verify ownership.
    if (!stmts.conversationById.get(conversationId, userId)) {
      return c.json({ error: "not_found" }, 404);
    }
  }
  if (lastUser && !body.skipUserPersist) {
    stmts.insertMessage.run(randomUUID(), conversationId, "user", lastUser.content, Date.now());
  }

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: "meta", data: JSON.stringify({ conversationId, model }) });
    const ac = new AbortController();
    stream.onAbort(() => ac.abort());

    // Optional citation-grounding pre-pass: retrieve real sources and inject
    // them before the system prompt's downstream content.
    if (body.grounding) {
      await stream.writeSSE({ event: "status", data: JSON.stringify({ phase: "grounding" }) });
      try {
        const { sources, contextMessage, queries } = await ground(apiKey, model, body.messages, ac.signal);
        if (contextMessage) messages.splice(1, 0, contextMessage);
        await stream.writeSSE({ event: "sources", data: JSON.stringify({ sources, queries }) });
      } catch {
        await stream.writeSSE({ event: "status", data: JSON.stringify({ phase: "grounding_skipped" }) });
      }
    }

    const source =
      body.provider === "ollama"
        ? streamOllama(env.ollamaUrl, { model, messages, temperature: body.temperature ?? 0.4 }, ac.signal)
        : streamChat(
            { apiKey, referer: env.publicUrl, title: "ARS Studio" },
            { model, messages, temperature: body.temperature ?? 0.4 },
            ac.signal
          );

    let full = "";
    try {
      for await (const chunk of source) {
        if (chunk.delta) {
          full += chunk.delta;
          await stream.writeSSE({ event: "delta", data: JSON.stringify({ t: chunk.delta }) });
        }
        if (chunk.done) break;
      }
      stmts.insertMessage.run(randomUUID(), conversationId!, "assistant", full, Date.now());
      stmts.touchConversation.run(Date.now(), conversationId!);
      await stream.writeSSE({ event: "done", data: JSON.stringify({ conversationId }) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "stream_error";
      await stream.writeSSE({ event: "error", data: JSON.stringify({ message }) });
    }
  });
});
