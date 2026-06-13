# Better-Auth Big-Bang Migration + Non-Gating Supporter Billing

Status: **in progress** (Phase 3 of the AI-native-patterns branch). Phases 1–2 (shadcn/ui
foundation + AI-native chat UX) already landed and build-verified on `claude/ai-native-patterns`.

User decisions (2026-06-13):
- **Cutover strategy: big-bang replace.** Rip out the custom JWT (`auth.ts`) + `oauth.ts`; adopt
  better-auth as the sole auth system. Migrate the existing `users` table.
- **Billing: non-gating supporter tier.** Stripe subscription via `@better-auth/stripe` exposed as
  an optional "supporter" membership that raises the daily free quota / adds cosmetic perks. It
  **never gates a core feature** — stays true to the free / CC-BY-NC ethos.

## Stack constraints (do not violate)

- Kept stack: **Hono server + better-sqlite3 + Vite/React web** (no Next, no Postgres).
- App ships as **Capacitor (iOS/Android) + Tauri (desktop)** → cookies are unreliable cross-origin.
  **Use the better-auth `bearer` plugin** so the client keeps storing a token in `localStorage` and
  sends `Authorization: Bearer <token>`. Do NOT switch the web client to cookie sessions.
- Existing passwords are Node `scryptSync(pw, salt, 64)` stored as `"<saltHex>:<hashHex>"`. A
  **custom `emailAndPassword.password.{hash,verify}`** must use this exact format so migrated users
  keep logging in. (better-auth's default scrypt params differ → without this, every existing user
  is locked out.)

## Dependencies

- Installed: `better-auth@1.6.18`, `@better-auth/stripe`, `stripe` (server).
- Peer warnings to resolve BEFORE trusting runtime:
  - better-auth wants `better-sqlite3@^12` (app pins `^11.7.0`). **Action:** bump `better-sqlite3`
    to `^12` in `server` (and `app` root if hoisted), `pnpm install`, and **rebuild the native
    binding** (`pnpm rebuild better-sqlite3`). Re-run the server test/boot to confirm the existing
    `db.ts` prepared statements still work (API is stable 11→12, but verify, don't assume).
  - `@better-auth/core` wants `jose@^6` (app has `jose@5`, only used by the about-to-be-deleted
    `auth.ts`/`oauth.ts`). After deleting those, bump `jose` to `^6` or drop it if unused elsewhere.

## Server changes

### `server/src/auth.ts` (rewrite — now the better-auth instance + middleware)
```ts
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { stripe as stripePlugin } from "@better-auth/stripe";
import Stripe from "stripe";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";
import { env } from "./env.js";
import type { Context, Next } from "hono";
import type { Env } from "./types.js";

function legacyHash(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
function legacyVerify(stored: string, pw: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = scryptSync(pw, salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  return keyBuf.length === derived.length && timingSafeEqual(keyBuf, derived);
}

const stripeClient = env.tips.stripeSecretKey
  ? new Stripe(env.tips.stripeSecretKey) : undefined;

export const auth = betterAuth({
  database: db,                       // share the existing better-sqlite3 instance
  baseURL: env.serverUrl,
  basePath: "/api/auth",
  secret: env.jwtSecret,              // reuse ARS_JWT_SECRET
  trustedOrigins: env.corsOrigins.includes("*") ? undefined : env.corsOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: env.requireEmailVerification,
    password: { hash: async (pw) => legacyHash(pw), verify: async ({ hash, password }) => legacyVerify(hash, password) },
    sendResetPassword: async ({ user, url }) => { /* sendMail(resetEmail(url)) */ },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => { /* sendMail(verificationEmail(url)) */ },
  },
  socialProviders: {
    ...(env.oauth.google.clientId && env.oauth.google.clientSecret ? { google: env.oauth.google } : {}),
    ...(env.oauth.github.clientId && env.oauth.github.clientSecret ? { github: env.oauth.github } : {}),
  },
  plugins: [
    bearer(),
    ...(stripeClient ? [stripePlugin({
      stripeClient,
      stripeWebhookSecret: env.stripe.webhookSecret,
      createCustomerOnSignup: true,
      subscription: {
        enabled: true,
        plans: [{ name: "supporter", priceId: env.stripe.supporterPriceId }],
      },
    })] : []),
  ],
});

// Interface-compatible replacement for the old requireAuth so every protected
// route (ai.ts / uploads.ts / export.ts / tips.ts) stays UNTOUCHED.
export async function requireAuth(c: Context<Env>, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
}
```
Notes:
- Keep `publicUser`? No longer needed server-side for auth responses (better-auth owns them), but
  `ai.ts` etc. only need `userId`. Leave domain code alone.
- `sendResetPassword` / `sendVerificationEmail` reuse `mail.ts` (`verificationEmail`, `resetEmail`).

### `server/src/oauth.ts` — **delete.** Social handled by better-auth.

### `server/src/db.ts`
- better-auth owns tables: `user`, `account`, `session`, `verification`, and (stripe) `subscription`.
- Create them via the better-auth CLI: `npx @better-auth/cli@latest migrate -y` (config at
  `server/src/auth.ts`). If the CLI is unreliable under tsx/pnpm ESM, fall back to
  `npx @better-auth/cli generate` to emit SQL and apply it in a guarded `db.exec(...)` block in
  db.ts (idempotent `CREATE TABLE IF NOT EXISTS`). Pin the generated SQL in the repo.
- **FK repoint:** the domain tables (`conversations`, `messages`, `usage_daily`, `uploads`)
  currently `REFERENCES users(id)`. Repoint to `REFERENCES user(id)`. Because better-auth user ids
  are preserved during migration (we keep the same uuid), existing rows stay valid. In sqlite,
  changing an FK target = table rebuild; since dev DBs are effectively empty this is cheap, but the
  migration script must do it inside a transaction with `foreign_keys=OFF` during rebuild.
- Drop legacy `users`, `oauth_accounts`, `auth_tokens` AFTER migration (better-auth provides
  verification + reset). Keep `events`.

### `server/src/migrate_to_better_auth.ts` (one-shot, idempotent)
For each legacy `users` row: insert `user` (id, email, name=display_name, emailVerified) + `account`
(providerId='credential', accountId=id, userId=id, password=legacy_hash). For each `oauth_accounts`
row: insert `account` (providerId=provider, accountId=provider_user_id, userId). Wrap in a txn; log
counts; safe to re-run (INSERT OR IGNORE).

### `server/src/index.ts`
- Remove `authRoutes` + `oauthRoutes` imports/mounts.
- Add session middleware + handler mount:
  ```ts
  app.use("*", async (c, next) => {
    const s = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    c.set("user", s?.user ?? null); await next();
  });
  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  ```
- Keep `edgeRateLimit` on `/api/auth/*` and `/api/ai/*`.
- `/api/health` features: add `supporter: !!env.stripe.supporterPriceId`.

### `server/src/env.ts`
Add `stripe: { webhookSecret, supporterPriceId }` from `STRIPE_WEBHOOK_SECRET`,
`ARS_SUPPORTER_PRICE_ID`. Document in `.env.example`.

### Quota (`ratelimit.ts`) — supporter perk
`getQuota`/`consume` gain a higher limit when the user has an active `supporter` subscription:
`limit = isSupporter(userId) ? env.supporterDailyMessages : env.freeDailyMessages`. `isSupporter`
checks the better-auth `subscription` table for an active row. **Never** blocks a core feature; only
raises the free ceiling. BYOK already bypasses quota entirely.

## Web changes

### `web/src/lib/auth-client.ts` (new)
```ts
import { createAuthClient } from "better-auth/react";
import { stripeClient } from "@better-auth/stripe/client";
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_BASE ?? "/api",   // points at /api/auth
  plugins: [stripeClient({ subscription: true })],
  fetchOptions: {
    onSuccess: (ctx) => {
      const t = ctx.response.headers.get("set-auth-token");
      if (t) localStorage.setItem("ars_token", t);     // reuse existing key
    },
  },
});
```
- Keep using `localStorage["ars_token"]`; `api.ts` already sends it as `Authorization: Bearer`.
  better-auth bearer plugin accepts it. So `api.ts` token plumbing is largely unchanged — just make
  sure non-auth calls keep attaching the header (they do).

### `web/src/auth.tsx`
Reimplement `AuthContext`/`useAuth` over `authClient.useSession()` (or a `me()` that calls
`authClient.getSession()`), exposing `{ user, loading, logout }`. `logout` → `authClient.signOut()` +
clear token. Map better-auth user → existing `PublicUser` shape (`displayName` ← `user.name`).

### `web/src/pages/Auth.tsx` + `AuthFlows.tsx`
Replace `api.login/signup/...` with `authClient.signIn.email`, `authClient.signUp.email`,
`authClient.requestPasswordReset`, `authClient.resetPassword`, `authClient.verifyEmail`, and OAuth
buttons → `authClient.signIn.social({ provider })`. The old `/oauth?token=` redirect handler is
removed (better-auth social returns via its own callback; bearer token arrives in headers).

### `web/src/api.ts`
Remove the auth-specific methods now owned by authClient (`signup`, `login`, `me`, `verifyEmail`,
`resendVerification`, `requestReset`, `resetPassword`, `oauthProviders`). Keep everything else.

## Supporter billing UI

- In `Settings.tsx` (or `Support.tsx`) add a "Supporter" card: if not subscribed, a button calling
  `authClient.subscription.upgrade({ plan: "supporter", successUrl, cancelUrl })`; if subscribed,
  show status + `authClient.subscription.cancel({ returnUrl })`. Copy must make clear it's optional
  and unlocks only a higher free quota / a badge — never core features.
- Webhook: better-auth stripe plugin exposes `/api/auth/stripe/webhook`. Configure
  `STRIPE_WEBHOOK_SECRET`. Document the Stripe dashboard setup in `.env.example` + MONETIZATION.md.

## Verification gates (MANDATORY — auth is not "done" on a build pass)

1. `pnpm --filter ./server build` + `pnpm --filter ./web build` clean.
2. Server boots; `GET /api/health` 200.
3. `POST /api/auth/sign-up/email` → 200 + `set-auth-token` header present.
4. `POST /api/auth/sign-in/email` → 200 + token; `GET /api/ai/quota` with `Authorization: Bearer
   <token>` → 200 (proves requireAuth via better-auth works on an unchanged protected route).
5. **Legacy user**: seed a `users` row with a known scrypt password (old format), run the migration,
   then sign-in with that email/password → 200. Proves the custom verify + migration.
6. `signOut` invalidates the session (subsequent `/api/ai/quota` → 401).
7. Social provider config-gated: with no Google/GitHub creds, no social routes error the boot.
8. Supporter: with Stripe test keys + price id, `subscription.upgrade` returns a Checkout URL.

## Out of scope (explicitly)
- No Drizzle, no Postgres, no Next.js.
- No gating of any core feature behind payment.
- Organizations / passkey / 2FA / SSO (template has them; not requested here).
</content>
</invoke>
