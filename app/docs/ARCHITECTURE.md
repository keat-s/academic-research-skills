# ARS Studio — Architecture

## Overview

ARS Studio adapts the Academic Research Skills suite (a 13-agent Claude Code
skill set) into a single-model app. The full suite orchestrates many agents
through Claude Code; ARS Studio runs **one** free model per turn under a strong
system-prompt contract that preserves the suite's load-bearing rules.

```
┌──────────────┐    HTTPS/SSE    ┌───────────────┐   OpenRouter   ┌────────────┐
│  Clients     │ ───────────────▶│  Server       │ ──────────────▶│ OpenRouter │
│  web / PWA   │   /api/ai/chat  │  (Hono)       │  :free models  │  (free LLMs)│
│  Tauri (dsk) │◀─────────────── │  auth + proxy │◀───────────────│            │
│  Capacitor   │   token stream  │  + rate limit │                └────────────┘
└──────────────┘                 │  + SQLite     │
                                 └───────────────┘
```

## Packages

### `packages/core` (`@ars/core`)
Pure TypeScript, no runtime deps. Shared by server and web.
- `modes.ts` — the 25 modes ported from `MODE_REGISTRY.md`, each with a
  mode-specific instruction block. `systemPromptFor(id)` assembles the full
  system prompt (`prompts.ts` core contract + mode instructions).
- `prompts.ts` — the ARS "Key Rules" contract (copilot-not-pilot, mandatory
  citations, evidence hierarchy, honest uncertainty, AI disclosure).
- `openrouter.ts` — OpenAI-compatible streaming client + free-model discovery.

### `server` (`@ars/server`)
Hono on Node.
- `auth.ts` — email/password signup/login, scrypt hashing, JWT (jose) sessions,
  `requireAuth` middleware.
- `ai.ts` — the streaming proxy. Injects the mode system prompt, enforces the
  free-tier quota (shared key only; BYOK bypasses), streams SSE deltas,
  persists conversations + messages.
- `ratelimit.ts` — per-user/UTC-day counter in SQLite.
- `monetize.ts` — config endpoint for the four funding channels.
- `db.ts` — better-sqlite3 schema (users, conversations, messages, usage_daily).

### `web` (`@ars/web`)
Vite + React + Tailwind + react-router. PWA via vite-plugin-pwa.
- `api.ts` — typed client incl. the SSE stream parser (`streamChat`).
- `useChat.ts` — chat state machine (optimistic user msg, streaming assistant
  bubble, abort/stop, BYOK passthrough from local settings).
- `pages/Studio.tsx` — sidebar (history + mode launcher) + chat view.
- `src-tauri/` — desktop shell. `capacitor.config.ts` — mobile shell.

## Request flow (a chat turn)

1. Client `POST /api/ai/chat` with `{ modeId, conversationId?, messages, model?, apiKey? }` + Bearer token.
2. Server validates auth + mode, resolves the system prompt.
3. If no BYOK key: check + decrement the user's daily free quota (429 if empty).
4. Server opens a streaming OpenRouter completion and relays deltas as SSE
   (`event: meta | delta | done | error`).
5. On completion the full assistant message + the user turn are persisted; the
   conversation list and quota refresh on the client.

## Security notes

- The shared OpenRouter key never leaves the server.
- BYOK keys live only in the user's browser localStorage and are forwarded
  per-request to OpenRouter; they are never written to the database.
- Passwords are scrypt-hashed with per-user salts. JWTs are HS256 with a
  configurable secret (`ARS_JWT_SECRET`).
- CSP is set for the Tauri shell; CORS is allowlist-configurable on the server.

## What this is NOT (honest limitations)

- It does **not** reproduce the suite's multi-agent orchestration, integrity
  gates, or cross-model verification. Those remain in the Claude Code skills.
- Free models are weaker than frontier models; long-document modes (systematic
  review, full pipeline) are best-effort and should be treated as drafts.
- Web search / live citation verification is not wired yet (roadmap below).

## Roadmap (sequencing the rest of "full production")

1. Email verification + password reset + OAuth (Google/GitHub).
2. Server-side document/file upload for review & revision modes.
3. Web-search tool calls for genuine citation grounding (closes the biggest
   fidelity gap with the skills).
4. Local-model fallback (WebLLM in browser, Ollama on desktop via Tauri).
5. Native builds in CI (Tauri matrix; Capacitor iOS/Android), store metadata.
6. Export to DOCX/LaTeX/PDF (Pandoc/tectonic) for the format-convert mode.
7. Usage analytics (privacy-preserving) + abuse rate limiting at the edge.
