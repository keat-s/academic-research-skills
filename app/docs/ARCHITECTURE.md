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
- `openrouter.ts` — OpenAI-compatible streaming + non-streaming client +
  free-model discovery.
- `ollama.ts` — local-model provider (same `StreamChunk` shape) + model list.
- `search.ts` — scholarly search across Crossref / OpenAlex / Semantic Scholar
  (free, key-less) + reference/source-block formatting for grounding.
- `export.ts` — pure Markdown → HTML / LaTeX / RTF converters.

### `server` (`@ars/server`)
Hono on Node.
- `auth.ts` — email/password signup/login, scrypt hashing, JWT (jose) sessions,
  `requireAuth` middleware, email verification + password reset (single-use
  tokens).
- `oauth.ts` — Google + GitHub sign-in (config-gated, CSRF via signed state).
- `mail.ts` — pluggable mailer (console transport in dev, SMTP in prod).
- `ai.ts` — the streaming proxy. Injects the mode system prompt + attached
  upload text, optional grounding pre-pass, routes to OpenRouter or Ollama,
  enforces the free-tier quota (shared key only; BYOK/local bypass), streams SSE
  (`meta`/`status`/`sources`/`delta`/`done`/`error`), persists the exchange.
- `grounding.ts` — RAG pre-pass: model-generated queries → scholarly search →
  injected source block.
- `uploads.ts` — multipart upload, PDF/text extraction (text only retained).
- `export.ts` — export route (core converters + pandoc for DOCX/PDF when present).
- `ratelimit.ts` — per-user/UTC-day counter; `edge_ratelimit.ts` — per-IP limiter.
- `analytics.ts` — privacy-preserving event counts (no content).
- `monetize.ts` — config endpoint for the four funding channels.
- `db.ts` — better-sqlite3 schema (users, conversations, messages, usage_daily,
  auth_tokens, oauth_accounts, events, uploads) + additive migration.

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

## Roadmap status

The original 7-item roadmap is now built (see the matrix in the README). What
remains is owner-gated, not code-gated:

- **Native store submission** — signing certs, Apple/Google developer accounts,
  screenshots, and a hosted privacy policy. CI produces unsigned artifacts;
  `docs/PACKAGING.md` documents the rest.
- **WebLLM in-browser local inference** — desktop local inference ships via
  Ollama; an in-browser WebLLM provider is a future addition.
- **Multi-instance scale** — the per-IP limiter and analytics are single-node;
  front with Redis/edge limiting and a warehouse for horizontal scale.
