import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { stripe as stripePlugin } from "@better-auth/stripe";
import Stripe from "stripe";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { db } from "./db.js";
import { env } from "./env.js";
import { sendMail, verificationEmail, resetEmail } from "./mail.js";
import type { Env } from "./types.js";

// --- legacy-compatible password hashing --------------------------------------
// Existing users were stored as Node `scryptSync(pw, salt, 64)` in the format
// "<saltHex>:<hashHex>". We override better-auth's password hash/verify with the
// exact same format so migrated users keep logging in (better-auth's default
// scrypt params differ — without this every existing user is locked out).
export function legacyHash(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
export function legacyVerify(stored: string, pw: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = scryptSync(pw, salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  return keyBuf.length === derived.length && timingSafeEqual(keyBuf, derived);
}

// Stripe client is only built when a secret key is present; the supporter plugin
// is additionally gated on the price id below so boot never fails without Stripe.
const stripeClient = env.tips.stripeSecretKey
  ? new Stripe(env.tips.stripeSecretKey)
  : undefined;

const stripeEnabled = !!stripeClient && !!env.stripe.supporterPriceId;

// better-auth blocks cross-origin auth requests whose Origin isn't trusted
// (CSRF protection). The web app is served from a different origin than this
// API (separate dev ports; potentially separate prod hosts), so we must
// explicitly trust the configured web origins. We never fall back to "trust
// all" — even when CORS is "*" — since that would defeat the CSRF guard. Any
// non-"*" CORS origins are folded in as well.
function trustedOrigins(): string[] {
  const set = new Set<string>();
  const add = (u: string) => {
    if (!u) return;
    try {
      set.add(new URL(u).origin);
    } catch {
      set.add(u); // already a bare origin or a wildcard pattern
    }
  };
  add(env.webUrl);
  add(env.publicUrl);
  add(env.serverUrl);
  for (const o of env.corsOrigins) if (o && o !== "*") add(o);
  // Dev convenience only: trust localhost on the common Vite dev ports so a
  // bare `pnpm dev` works even when 5173 is taken and the web lands on 5174/75.
  // Production stays strict (env-derived origins only).
  if (process.env.NODE_ENV !== "production") {
    for (const port of [5173, 5174, 5175]) {
      add(`http://localhost:${port}`);
      add(`http://127.0.0.1:${port}`);
    }
  }
  return [...set];
}

export const auth = betterAuth({
  database: db, // share the existing better-sqlite3 instance
  baseURL: env.serverUrl,
  basePath: "/api/auth",
  secret: env.jwtSecret, // reuse ARS_JWT_SECRET
  trustedOrigins: trustedOrigins(),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: env.requireEmailVerification,
    password: {
      hash: async (pw) => legacyHash(pw),
      verify: async ({ hash, password }) => legacyVerify(hash, password),
    },
    sendResetPassword: async ({ user, url }) => {
      await sendMail({ to: user.email, ...resetEmail(url) }).catch(() => {});
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({ to: user.email, ...verificationEmail(url) }).catch(() => {});
    },
  },
  socialProviders: {
    ...(env.oauth.google.clientId && env.oauth.google.clientSecret
      ? { google: env.oauth.google }
      : {}),
    ...(env.oauth.github.clientId && env.oauth.github.clientSecret
      ? { github: env.oauth.github }
      : {}),
  },
  plugins: [
    bearer(),
    ...(stripeEnabled
      ? [
          stripePlugin({
            stripeClient: stripeClient!,
            stripeWebhookSecret: env.stripe.webhookSecret,
            createCustomerOnSignup: true,
            subscription: {
              enabled: true,
              plans: [{ name: "supporter", priceId: env.stripe.supporterPriceId }],
            },
          }),
        ]
      : []),
  ],
});

/**
 * Interface-compatible replacement for the old custom-JWT `requireAuth`. Every
 * protected route (ai.ts / uploads.ts / export.ts / tips.ts) stays UNTOUCHED:
 * it still reads `c.var.userId`. The session is resolved by better-auth from the
 * `Authorization: Bearer <token>` header (bearer plugin).
 */
export async function requireAuth(c: Context<Env>, next: Next) {
  const session = await auth.api
    .getSession({ headers: c.req.raw.headers })
    .catch(() => null);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
}
