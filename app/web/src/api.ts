import type { Mode, ChatMessage, ModelInfo } from "@ars/core";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

let token: string | null = localStorage.getItem("ars_token");

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem("ars_token", t);
  else localStorage.removeItem("ars_token");
}
export function getToken() {
  return token;
}

function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "error", data);
  return data as T;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, public body: unknown) {
    super(code);
  }
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
}

export const api = {
  health: () => jsonFetch<{ ok: boolean; sharedKey: boolean; freeDailyMessages: number }>("/health"),
  modes: () => jsonFetch<{ modes: Mode[] }>("/modes").then((r) => r.modes),
  monetization: () => jsonFetch<MonetizationConfig>("/monetization"),

  signup: (email: string, password: string, displayName?: string) =>
    jsonFetch<{ token: string; user: PublicUser }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    }),
  login: (email: string, password: string) =>
    jsonFetch<{ token: string; user: PublicUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => jsonFetch<{ user: PublicUser }>("/auth/me").then((r) => r.user),

  models: () => jsonFetch<{ models: ModelInfo[]; sharedKey: boolean }>("/ai/models"),
  quota: () => jsonFetch<{ used: number; limit: number; remaining: number }>("/ai/quota"),
  conversations: () => jsonFetch<{ conversations: Conversation[] }>("/ai/conversations").then((r) => r.conversations),
  conversation: (id: string) =>
    jsonFetch<{ conversation: Conversation; messages: StoredMessage[] }>(`/ai/conversations/${id}`),
  deleteConversation: (id: string) =>
    jsonFetch<{ ok: boolean }>(`/ai/conversations/${id}`, { method: "DELETE" }),
};

export interface Conversation {
  id: string;
  user_id: string;
  mode_id: string;
  title: string;
  created_at: number;
  updated_at: number;
}
export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
}
export interface MonetizationConfig {
  donations: { label: string; url: string }[];
  sponsorTiers: { name: string; blurb: string; url: string }[];
  affiliates: { label: string; url: string; note: string }[];
  grants: { label: string; url: string }[];
  ads: { enabled: boolean; provider: string; publisherId: string; note: string };
  byok: { enabled: boolean; note: string };
}

export interface ChatStreamHandlers {
  onMeta?: (meta: { conversationId: string; model: string }) => void;
  onDelta: (text: string) => void;
  onDone?: (meta: { conversationId: string }) => void;
  onError?: (message: string) => void;
}

/**
 * Stream a chat completion. Parses the server's SSE events.
 * Returns an abort function.
 */
export function streamChat(
  body: {
    modeId: string;
    conversationId?: string;
    messages: ChatMessage[];
    model?: string;
    apiKey?: string;
  },
  handlers: ChatStreamHandlers
): () => void {
  const ac = new AbortController();
  (async () => {
    try {
      const res = await fetch(`${BASE}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        handlers.onError?.((data as { message?: string }).message ?? `error ${res.status}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let event = "message";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (!data) continue;
            try {
              const parsed = JSON.parse(data);
              if (event === "meta") handlers.onMeta?.(parsed);
              else if (event === "delta") handlers.onDelta(parsed.t);
              else if (event === "done") handlers.onDone?.(parsed);
              else if (event === "error") handlers.onError?.(parsed.message);
            } catch {
              /* ignore partial */
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        handlers.onError?.((err as Error).message);
      }
    }
  })();
  return () => ac.abort();
}
