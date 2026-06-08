import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { randomUUID } from "node:crypto";
import {
  systemPromptFor,
  streamChat,
  fetchFreeModels,
  DEFAULT_FREE_MODELS,
  DEFAULT_MODEL,
  type ChatMessage,
} from "@ars/core";
import { env, hasSharedKey } from "./env.js";
import { stmts } from "./db.js";
import { requireAuth } from "./auth.js";
import { consume, getQuota } from "./ratelimit.js";
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

  const usingByok = typeof body.apiKey === "string" && body.apiKey.length > 0;
  const apiKey = usingByok ? body.apiKey! : env.openrouterKey;

  if (!usingByok) {
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

  const model = body.model || DEFAULT_MODEL;
  const messages: ChatMessage[] = [{ role: "system", content: system }, ...body.messages];

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
  if (lastUser) {
    stmts.insertMessage.run(randomUUID(), conversationId, "user", lastUser.content, Date.now());
  }

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: "meta", data: JSON.stringify({ conversationId, model }) });
    let full = "";
    const ac = new AbortController();
    stream.onAbort(() => ac.abort());
    try {
      for await (const chunk of streamChat(
        { apiKey, referer: env.publicUrl, title: "ARS Studio" },
        { model, messages, temperature: body.temperature ?? 0.4 },
        ac.signal
      )) {
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
