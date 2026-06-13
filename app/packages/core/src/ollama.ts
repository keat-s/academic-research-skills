import type { ChatMessage } from "./types.js";
import type { StreamChunk } from "./openrouter.js";

// Local-model provider via Ollama (http://localhost:11434). Lets users run
// fully offline/private inference on desktop. Same StreamChunk shape as the
// OpenRouter client so the server can swap providers transparently.

export async function* streamOllama(
  baseUrl: string,
  body: { model: string; messages: ChatMessage[]; temperature?: number },
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: body.model,
      messages: body.messages,
      stream: true,
      options: { temperature: body.temperature ?? 0.4 },
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean };
        const delta = parsed.message?.content;
        if (delta) yield { delta, done: false };
        if (parsed.done) {
          yield { delta: "", done: true };
          return;
        }
      } catch {
        // ignore partial line
      }
    }
  }
  yield { delta: "", done: true };
}

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { models?: { name: string }[] };
    return (json.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}
