# ARS Studio

**AI-native academic research, writing, and peer review — free, on web, mobile, and desktop.**

ARS Studio is a standalone application built on the
[Academic Research Skills](../README.md) suite. It exposes the suite's 25
research/writing/review **modes** as a chat-style app that runs on **free open
models** (via OpenRouter), with citation grounding, document upload, multi-format
export, and optional fully-local inference.

> AI is your copilot, not the pilot. Every citation must be verified. This is a
> single-model adaptation of the full 13-agent suite — faithful to its rules
> (citation discipline, evidence hierarchy, human-in-the-loop), not a
> replacement for it.

## One codebase → six targets

| Target | How |
|---|---|
| **Web / PWA** | `web/` — Vite + React, installable PWA |
| **iOS / Android** | [Capacitor](https://capacitorjs.com) wraps `web/dist` |
| **Windows / macOS / Linux** | [Tauri 2](https://tauri.app) wraps `web/dist` |

## Status: what's built vs. what needs doing

Legend: ✅ built & verified · 🔌 built, needs your config/secrets to activate ·
🚧 scaffolded, needs external infra/accounts to finish.

### Core app
| Feature | Status | Notes |
|---|---|---|
| 25 research/writing/review modes | ✅ | Ported from `MODE_REGISTRY.md`; system-prompt contract preserves ARS rules. |
| Email/password auth (JWT, scrypt) | ✅ | Signup, login, `/me`, session middleware. |
| Streaming chat (SSE) | ✅ | Server proxies OpenRouter; deltas streamed to the client. |
| Free-tier rate limiting + BYOK | ✅ | Daily per-user budget on the shared key; BYOK bypasses it. |
| Conversation history | ✅ | Persisted in SQLite, listed in the sidebar. |
| PWA + responsive UI | ✅ | Installable, offline shell via service worker. |

### Roadmap (this pass)
| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | Email verification + password reset | ✅ | Single-use tokens; console mailer in dev, SMTP in prod (🔌 set `SMTP_*`). |
| 1 | OAuth (Google / GitHub) | 🔌 | Full flow built (CSRF-safe). Activates when `*_CLIENT_ID/SECRET` are set. |
| 2 | Document upload for review/revision | ✅ | PDF (unpdf) + text extraction; attach by id to a chat turn. |
| 3 | **Web-search citation grounding** | ✅ | RAG pre-pass over Crossref + OpenAlex + Semantic Scholar; injects real DOIs. Works on any model. |
| 4 | Local-model fallback | ✅ | **In-browser WebLLM** (WebGPU, fully client-side, no key/quota) **and** Ollama (desktop). Three-way backend toggle in Settings. |
| 5 | Native builds in CI + store metadata | 🚧 | `desktop-build.yml` (Tauri matrix) + `mobile-build.yml` (Capacitor) produce **unsigned** artifacts; signing/upload need accounts + secrets. See `docs/PACKAGING.md`. |
| 6 | Export to DOCX/LaTeX/PDF | ✅ | MD/HTML/LaTeX/RTF always available (pure converters); DOCX/PDF via pandoc when present (🔌 install pandoc), clean fallback otherwise. |
| 7 | Analytics + edge rate limiting | ✅ | Privacy-preserving counts (no content) + token-gated `/api/metrics`; per-IP limiter on auth+AI routes. |

### Ship-readiness pass (post-roadmap)
| Feature | Status | Notes |
|---|---|---|
| Tip-jar checkout | 🔌 | Stripe Checkout (set `STRIPE_SECRET_KEY`) or any hosted payment link (`ARS_TIP_PAYMENT_LINK`). Tips never unlock anything. |
| Chat actions | ✅ | Copy, edit-and-resend, regenerate, stop-and-continue — with server-side history truncation so reloads stay consistent. |
| Visual design pass | ✅ | Gradient design system, Inter font, per-skill accents, animations, polished landing page. |
| E2E tests (Playwright) | ✅ | 12 tests drive the real app (auth, launcher, chat error paths, settings, support); `pnpm e2e` + CI workflow. |
| Abuse hardening | ✅ | Secure headers, 10 MB body limit, login brute-force lockout, per-user upload caps, prod refuses the dev JWT secret. |

### Honest limitations
- This does **not** reproduce the suite's multi-agent orchestration, integrity
  gates, or cross-model verification — those remain in the Claude Code skills.
- Free models are weaker than frontier models; long-document modes (systematic
  review, full pipeline) are best-effort drafts.
- In-browser WebLLM needs a WebGPU-capable browser and downloads model weights
  (0.9–3.7 GB) on first use; small models fit modest GPUs. Native store
  submission needs the project owner's accounts and signing secrets (documented,
  not automated).

## Architecture

```
app/
├── packages/core/   # shared TS: 25 modes + ARS rules contract, OpenRouter +
│                     #   Ollama clients, scholarly search, export converters
├── server/          # Hono API: auth (+ verify/reset/OAuth), streaming AI proxy
│                     #   (grounding, uploads, local model), rate limiting,
│                     #   SQLite, analytics, monetization, export
└── web/             # React + Vite + Tailwind PWA (+ src-tauri/, capacitor)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the request flow and
package breakdown, and [docs/PACKAGING.md](docs/PACKAGING.md) for native builds.

## Quick start (dev)

```bash
cd app
cp .env.example .env          # set ARS_JWT_SECRET; OPENROUTER_API_KEY optional
pnpm install
pnpm --filter ./packages/core build
pnpm dev                      # server :8787 + web :5173
```

Open http://localhost:5173, sign up, pick a mode, start chatting.

- **No `OPENROUTER_API_KEY`?** BYOK-only mode — add your own free key in Settings.
- **Want grounded citations?** Toggle "Ground citations" in the composer (needs
  outbound access to Crossref/OpenAlex/Semantic Scholar).
- **Want offline AI?** Settings → In-browser (WebGPU, downloads a model once) or
  Ollama (run [Ollama](https://ollama.com) locally).
- **Desktop:** `pnpm desktop` (needs Rust). **Mobile:** `pnpm --filter ./web build && pnpm mobile:sync`, then `npx cap add ios|android`.

## Monetization

Free to use, no subscriptions. Funding is voluntary and license-safe under
CC BY-NC 4.0 — donations, sponsorship, a BYOK tip jar, affiliate/grants, and an
optional (off-by-default) non-tracking ad slot. See
[docs/MONETIZATION.md](docs/MONETIZATION.md).

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Run server + web together |
| `pnpm build` | Build core → server → web |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm test` | Run unit tests (core + server) |
| `pnpm desktop` | Tauri desktop dev |
| `pnpm mobile:sync` | Sync the web build into native shells |

## License

CC BY-NC 4.0, inherited from the parent suite. The app adds no commercial use.
