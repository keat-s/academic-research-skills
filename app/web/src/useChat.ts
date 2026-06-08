import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "@ars/core";
import { streamChat } from "./api";
import { loadSettings } from "./settings";

export interface UiMessage extends ChatMessage {
  role: "user" | "assistant";
}

export interface UseChat {
  messages: UiMessage[];
  streaming: boolean;
  error: string | null;
  conversationId: string | null;
  send: (text: string) => void;
  stop: () => void;
  reset: (seed?: UiMessage[], conversationId?: string | null) => void;
}

export function useChat(modeId: string): UseChat {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const reset = useCallback((seed: UiMessage[] = [], convId: string | null = null) => {
    abortRef.current?.();
    setMessages(seed);
    setConversationId(convId);
    setError(null);
    setStreaming(false);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.();
    setStreaming(false);
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setError(null);

      const userMsg: UiMessage = { role: "user", content: trimmed };
      const history = [...messages, userMsg];
      setMessages([...history, { role: "assistant", content: "" }]);
      setStreaming(true);

      const { apiKey, model } = loadSettings();

      abortRef.current = streamChat(
        {
          modeId,
          conversationId: conversationId ?? undefined,
          messages: history,
          model: model || undefined,
          apiKey: apiKey || undefined,
        },
        {
          onMeta: (m) => setConversationId(m.conversationId),
          onDelta: (t) =>
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, content: last.content + t };
              }
              return next;
            }),
          onDone: () => setStreaming(false),
          onError: (msg) => {
            setError(msg);
            setStreaming(false);
            // Drop the empty assistant bubble on hard failure.
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant" && last.content === "") return prev.slice(0, -1);
              return prev;
            });
          },
        }
      );
    },
    [messages, streaming, modeId, conversationId]
  );

  return { messages, streaming, error, conversationId, send, stop, reset };
}
