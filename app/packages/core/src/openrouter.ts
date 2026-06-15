import type { ChatMessage, ModelInfo } from "./types.js";

// Minimal OpenRouter client. Used server-side (shared key) and, for BYOK,
// with a user-supplied key. OpenRouter is OpenAI-compatible.

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// Curated default free models (the ":free" tier). OpenRouter rotates these;
// the server also fetches the live list and intersects, so this is a fallback.
export const DEFAULT_FREE_MODELS: ModelInfo[] = [
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (free)", free: true },
  { id: "deepseek/deepseek-chat-v3-0324:free", name: "DeepSeek V3 (free)", free: true },
  { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (free)", free: true },
  { id: "qwen/qwen-2.5-72b-instruct:free", name: "Qwen 2.5 72B (free)", free: true },
  { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash exp (free)", free: true },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", name: "Mistral Small 3.1 (free)", free: true },
];

export const DEFAULT_MODEL = DEFAULT_FREE_MODELS[0]!.id;

export interface OpenRouterOpts {
  apiKey: string;
  /** For OpenRouter analytics / free-tier eligibility. */
  referer?: string;
  title?: string;
}

function headers(opts: OpenRouterOpts): Record<string, string> {
  return {
    Authorization: `Bearer ${opts.apiKey}`,
    "Content-Type": "application/json",
    ...(opts.referer ? { "HTTP-Referer": opts.referer } : {}),
    ...(opts.title ? { "X-Title": opts.title } : {}),
  };
}

/** Fetch the live model catalogue and return only free models. */
export async function fetchFreeModels(opts: OpenRouterOpts): Promise<ModelInfo[]> {
  const res = await fetch(`${OPENROUTER_BASE}/models`, { headers: headers(opts) });
  if (!res.ok) return DEFAULT_FREE_MODELS;
  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string };
    }>;
  };
  const models = (json.data ?? [])
    .map((m) => {
      const promptPrice = Number(m.pricing?.prompt ?? "0");
      const completionPrice = Number(m.pricing?.completion ?? "0");
      const free = m.id.endsWith(":free") || (promptPrice === 0 && completionPrice === 0);
      return {
        id: m.id,
        name: m.name ?? m.id,
        free,
        contextLength: m.context_length,
      } satisfies ModelInfo;
    })
    .filter((m) => m.free);
  return models.length > 0 ? models : DEFAULT_FREE_MODELS;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
}

/**
 * Stream a chat completion from OpenRouter. Yields text deltas.
 * Parses the OpenAI-compatible SSE stream.
 */
export async function* streamChat(
  opts: OpenRouterOpts,
  body: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
  },
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: headers(opts),
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Wrap the read loop in try/finally so the upstream socket is always
  // released — even if the consumer exits early (e.g. AbortController fires
  // or the SSE handler throws before draining the stream).
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          yield { delta: "", done: true };
          return;
        }
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield { delta, done: false };
        } catch {
          // partial JSON across chunks — ignore; the buffer logic recombines.
        }
      }
    }
  } finally {
    // cancel() signals the server to stop sending and releases the socket.
    // Safe to call even if the stream is already exhausted or errored.
    reader.cancel().catch(() => {});
  }
  yield { delta: "", done: true };
}

/** Non-streaming completion. Used for short internal calls (e.g. query generation). */
export async function chatComplete(
  opts: OpenRouterOpts,
  body: { model: string; messages: ChatMessage[]; temperature?: number; maxTokens?: number },
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: headers(opts),
    body: JSON.stringify({
      model: body.model,
      messages: body.messages,
      temperature: body.temperature ?? 0.2,
      max_tokens: body.maxTokens,
      stream: false,
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}
