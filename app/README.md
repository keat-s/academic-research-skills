# ARS Studio

**AI-native academic research, writing, and peer review — free, on web, mobile, and desktop.**

ARS Studio is a standalone application built on the
[Academic Research Skills](../README.md) suite. It exposes the suite's 25
research/writing/review **modes** as a chat-style app that runs on **free open
models** (via OpenRouter) so the AI features cost users nothing — or users can
bring their own key.

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

## Architecture

```
app/
├── packages/core/   # shared TS: 25 modes (ported from MODE_REGISTRY.md),
│                     #   ARS rules contract, OpenRouter client
├── server/          # Hono API: email/password auth (JWT), AI proxy with
│                     #   per-user free-tier rate limiting + BYOK, SQLite,
│                     #   monetization config
└── web/             # React PWA (+ src-tauri/ desktop, capacitor.config.ts mobile)
```

The server proxies OpenRouter so the shared key is never exposed to clients.
Signed-up users get a daily free-message budget on the shared key; adding their
own key (stored only in their browser) removes the limit. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start (dev)

```bash
cd app
cp .env.example .env          # set ARS_JWT_SECRET; OPENROUTER_API_KEY optional
pnpm install
pnpm --filter ./packages/core build
pnpm dev                      # server :8787 + web :5173
```

Open http://localhost:5173, sign up, pick a mode, start chatting.

- **No `OPENROUTER_API_KEY`?** The app runs in BYOK-only mode — each user adds
  their own free OpenRouter key in Settings.
- **Want desktop?** `pnpm desktop` (requires the Rust toolchain).
- **Want mobile?** `pnpm --filter ./web build && pnpm mobile:sync`, then
  `npx cap add ios|android` and `npx cap open ios|android`.

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
