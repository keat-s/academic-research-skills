import {
  systemPromptFor,
  formatSourcesBlock,
  buildUploadBlock,
  type ChatMessage,
} from "@ars/core";
import { api, type ChatStreamHandlers } from "./api";
import { streamWebLLM } from "./webllm";

// Runs a complete chat turn entirely in the browser using WebLLM, while still
// reusing the server for the things it's good for: scholarly retrieval
// (grounding), upload-text fetch, and persistence. Mirrors the server stream's
// handler shape so useChat can treat both paths identically.

export interface WebLLMTurnBody {
  modeId: string;
  conversationId?: string;
  messages: ChatMessage[];
  webllmModel: string;
  grounding?: boolean;
  uploadIds?: string[];
  /** Continuation turn: the trailing synthetic user instruction is not persisted. */
  continuation?: boolean;
}

export function runWebLLMTurn(body: WebLLMTurnBody, handlers: ChatStreamHandlers): () => void {
  const ac = new AbortController();

  (async () => {
    try {
      const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
      const userText = lastUser?.content ?? "";

      const system = systemPromptFor(body.modeId);
      const msgs: ChatMessage[] = [{ role: "system", content: system ?? "" }];

      // Attach uploaded document text (fetched from the server, owner-gated).
      if (body.uploadIds && body.uploadIds.length > 0) {
        const docs: string[] = [];
        for (const id of body.uploadIds.slice(0, 5)) {
          try {
            const u = await api.uploadText(id);
            docs.push(`--- DOCUMENT: ${u.filename} ---\n${u.text}`);
          } catch {
            /* skip */
          }
        }
        if (docs.length) {
          msgs.push({
            role: "system",
            content: buildUploadBlock(docs),
          });
        }
      }

      // Citation grounding: retrieve real sources via the server, inject them.
      if (body.grounding && userText) {
        handlers.onStatus?.({ phase: "grounding" });
        try {
          const sources = await api.search(userText);
          msgs.push({
            role: "system",
            content: formatSourcesBlock(sources),
          });
          handlers.onSources?.({ sources, queries: [userText] });
        } catch {
          /* grounding is best-effort */
        }
      }

      msgs.push(...body.messages);

      handlers.onStatus?.({ phase: "loading_model:0" });
      let full = "";
      for await (const chunk of streamWebLLM(
        body.webllmModel,
        { messages: msgs },
        {
          signal: ac.signal,
          onProgress: (p) =>
            handlers.onStatus?.({ phase: `loading_model:${Math.round(p.progress * 100)}` }),
        }
      )) {
        if (chunk.delta) {
          full += chunk.delta;
          handlers.onDelta(chunk.delta);
        }
        if (chunk.done) break;
      }

      if (ac.signal.aborted) return;

      // Persist the completed exchange so it appears in history.
      try {
        const { conversationId } = await api.saveExchange({
          conversationId: body.conversationId,
          modeId: body.modeId,
          userText: body.continuation ? "" : userText,
          assistantText: full,
        });
        handlers.onMeta?.({ conversationId, model: body.webllmModel });
        handlers.onDone?.({ conversationId });
      } catch {
        handlers.onDone?.({ conversationId: body.conversationId ?? "" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "webllm_error";
      handlers.onError?.(message);
    }
  })();

  return () => ac.abort();
}
