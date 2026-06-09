import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "@ars/core";
import { streamChat, type SourceRef, type ChatStreamHandlers } from "./api";
import { loadSettings } from "./settings";

export interface UiMessage extends ChatMessage {
  role: "user" | "assistant";
  sources?: SourceRef[];
}

export interface SendOptions {
  grounding?: boolean;
  uploadIds?: string[];
}

export interface UseChat {
  messages: UiMessage[];
  streaming: boolean;
  status: string | null;
  error: string | null;
  conversationId: string | null;
  send: (text: string, opts?: SendOptions) => void;
  stop: () => void;
  reset: (seed?: UiMessage[], conversationId?: string | null) => void;
}

export function useChat(modeId: string): UseChat {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const reset = useCallback((seed: UiMessage[] = [], convId: string | null = null) => {
    abortRef.current?.();
    setMessages(seed);
    setConversationId(convId);
    setError(null);
    setStatus(null);
    setStreaming(false);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.();
    setStreaming(false);
  }, []);

  const send = useCallback(
    (text: string, opts: SendOptions = {}) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setError(null);
      setStatus(null);

      const userMsg: UiMessage = { role: "user", content: trimmed };
      const history = [...messages, userMsg];
      setMessages([...history, { role: "assistant", content: "" }]);
      setStreaming(true);

      const { apiKey, model, provider, localModel, webllmModel, grounding } = loadSettings();
      const useOllama = provider === "ollama";
      const useWebllm = provider === "webllm";
      const useGrounding = opts.grounding ?? grounding;

      const handlers: ChatStreamHandlers = {
          onMeta: (m) => setConversationId(m.conversationId),
          onStatus: (s) => setStatus(s.phase),
          onSources: (s) =>
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, sources: s.sources };
              }
              return next;
            }),
          onDelta: (t) => {
            setStatus(null);
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, content: last.content + t };
              }
              return next;
            });
          },
          onDone: () => {
            setStreaming(false);
            setStatus(null);
          },
          onError: (msg: string) => {
            setError(msg);
            setStreaming(false);
            setStatus(null);
            // Drop an empty assistant bubble (keep it if sources arrived).
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant" && last.content === "" && !last.sources) {
                return prev.slice(0, -1);
              }
              return prev;
            });
          },
      };

      if (useWebllm) {
        // Fully client-side generation (WebGPU); server only retrieves +
        // persists. Lazy-imported so the heavy engine isn't in the main bundle.
        import("./webllmTurn").then(({ runWebLLMTurn }) => {
          abortRef.current = runWebLLMTurn(
            {
              modeId,
              conversationId: conversationId ?? undefined,
              messages: history,
              webllmModel: webllmModel || "Llama-3.2-1B-Instruct-q4f16_1-MLC",
              grounding: useGrounding,
              uploadIds: opts.uploadIds,
            },
            handlers
          );
        });
      } else {
        abortRef.current = streamChat(
          {
            modeId,
            conversationId: conversationId ?? undefined,
            messages: history,
            model: useOllama ? localModel || undefined : model || undefined,
            apiKey: useOllama ? undefined : apiKey || undefined,
            provider: useOllama ? "ollama" : "openrouter",
            grounding: useGrounding,
            uploadIds: opts.uploadIds,
          },
          handlers
        );
      }
    },
    [messages, streaming, modeId, conversationId]
  );

  return { messages, streaming, status, error, conversationId, send, stop, reset };
}
