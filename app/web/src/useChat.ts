import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "@ars/core";
import { api, streamChat, type SourceRef, type ChatStreamHandlers } from "./api";
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
  /** True after the user pressed Stop mid-generation (enables Continue). */
  stopped: boolean;
  send: (text: string, opts?: SendOptions) => void;
  /** Re-run generation for the last user turn (drops the last answer). */
  regenerate: () => void;
  /** Edit the user message at `index` and re-run from there. */
  editAndResend: (index: number, text: string) => void;
  /** Resume a stopped generation where it left off. */
  continueGeneration: () => void;
  stop: () => void;
  reset: (seed?: UiMessage[], conversationId?: string | null) => void;
}

const CONTINUE_INSTRUCTION =
  "Continue your previous answer exactly where it stopped. Do not repeat what you already wrote; do not add a preamble.";

export function useChat(modeId: string): UseChat {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  // Bookkeeping for stop-persistence (the server only persists completed turns).
  const turnRef = useRef<{ provider: string; userText: string; convId: string | null }>({
    provider: "openrouter",
    userText: "",
    convId: null,
  });

  const reset = useCallback((seed: UiMessage[] = [], convId: string | null = null) => {
    abortRef.current?.();
    setMessages(seed);
    setConversationId(convId);
    setError(null);
    setStatus(null);
    setStreaming(false);
    setStopped(false);
  }, []);

  /** Core dispatcher shared by send / regenerate / edit / continue. */
  const dispatch = useCallback(
    (
      outgoing: ChatMessage[],
      uiBefore: UiMessage[],
      opts: SendOptions & { skipUserPersist?: boolean; appendToLast?: boolean; convId: string | null }
    ) => {
      setError(null);
      setStatus(null);
      setStopped(false);

      // appendToLast: continue-mode — stream into the existing last assistant
      // bubble instead of opening a new one.
      setMessages(opts.appendToLast ? uiBefore : [...uiBefore, { role: "assistant", content: "" }]);
      setStreaming(true);

      const { apiKey, model, provider, localModel, webllmModel, grounding } = loadSettings();
      const useOllama = provider === "ollama";
      const useWebllm = provider === "webllm";
      const useGrounding = opts.grounding ?? grounding;
      const lastUser = [...outgoing].reverse().find((m) => m.role === "user");
      turnRef.current = { provider, userText: lastUser?.content ?? "", convId: opts.convId };

      const handlers: ChatStreamHandlers = {
        onMeta: (m) => {
          setConversationId(m.conversationId);
          turnRef.current.convId = m.conversationId;
        },
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
        onError: (msg) => {
          setError(msg);
          setStreaming(false);
          setStatus(null);
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
        // Fully client-side generation (WebGPU); lazy-loaded engine chunk.
        import("./webllmTurn").then(({ runWebLLMTurn }) => {
          abortRef.current = runWebLLMTurn(
            {
              modeId,
              conversationId: opts.convId ?? undefined,
              messages: outgoing,
              webllmModel: webllmModel || "Llama-3.2-1B-Instruct-q4f16_1-MLC",
              grounding: useGrounding && !opts.skipUserPersist,
              uploadIds: opts.uploadIds,
              continuation: opts.skipUserPersist,
            },
            handlers
          );
        });
      } else {
        abortRef.current = streamChat(
          {
            modeId,
            conversationId: opts.convId ?? undefined,
            messages: outgoing,
            model: useOllama ? localModel || undefined : model || undefined,
            apiKey: useOllama ? undefined : apiKey || undefined,
            provider: useOllama ? "ollama" : "openrouter",
            grounding: useGrounding && !opts.skipUserPersist,
            uploadIds: opts.uploadIds,
            skipUserPersist: opts.skipUserPersist,
          },
          handlers
        );
      }
    },
    [modeId]
  );

  const send = useCallback(
    (text: string, opts: SendOptions = {}) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      const userMsg: UiMessage = { role: "user", content: trimmed };
      const ui = [...messages, userMsg];
      dispatch(ui, ui, { ...opts, convId: conversationId });
    },
    [messages, streaming, conversationId, dispatch]
  );

  /** Edit user turn at `index` (must be a user message) and re-run from there. */
  const editAndResend = useCallback(
    (index: number, text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      const target = messages[index];
      if (!target || target.role !== "user") return;
      // Ordinal (1-based) of this user message — the server-side truncate anchor.
      const k = messages.slice(0, index + 1).filter((m) => m.role === "user").length;
      const base = messages.slice(0, index);
      const run = () => {
        const ui = [...base, { role: "user", content: trimmed } as UiMessage];
        dispatch(ui, ui, { convId: conversationId });
      };
      if (conversationId) {
        api.truncateConversation(conversationId, k).then(run, run);
      } else {
        run();
      }
    },
    [messages, streaming, conversationId, dispatch]
  );

  const regenerate = useCallback(() => {
    if (streaming) return;
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIdx === -1) return;
    editAndResend(lastUserIdx, messages[lastUserIdx]!.content);
  }, [messages, streaming, editAndResend]);

  const continueGeneration = useCallback(() => {
    if (streaming || !stopped) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !last.content) return;
    const outgoing: ChatMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: CONTINUE_INSTRUCTION },
    ];
    dispatch(outgoing, messages, {
      convId: conversationId,
      skipUserPersist: true,
      appendToLast: true,
    });
  }, [messages, streaming, stopped, conversationId, dispatch]);

  const stop = useCallback(() => {
    abortRef.current?.();
    setStreaming(false);
    setStatus(null);
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      const partial = last && last.role === "assistant" ? last.content : "";
      const { provider, userText, convId } = turnRef.current;
      if (partial && convId) {
        setStopped(true);
        // The server persists only completed turns — save the partial so it
        // survives a reload. On the WebLLM path the user turn wasn't persisted
        // either, so include it there.
        api
          .saveExchange({
            conversationId: convId,
            modeId,
            userText: provider === "webllm" ? userText : "",
            assistantText: partial,
          })
          .catch(() => {});
      }
      return prev;
    });
  }, [modeId]);

  return {
    messages,
    streaming,
    status,
    error,
    conversationId,
    stopped,
    send,
    regenerate,
    editAndResend,
    continueGeneration,
    stop,
    reset,
  };
}
