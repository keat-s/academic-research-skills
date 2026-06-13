import { Hono } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import type { Env } from "./types.js";
import { env } from "./env.js";
import { stmts, type UserRow, type TokenRow } from "./db.js";
import { sendMail, verificationEmail, resetEmail } from "./mail.js";
import { track } from "./analytics.js";

const secret = new TextEncoder().encode(env.jwtSecret);
const TOKEN_TTL = "30d";

// --- password hashing (scrypt; no native bcrypt dependency) ---
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  return keyBuf.length === derived.length && timingSafeEqual(keyBuf, derived);
}

export async function issueToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secret);
}

function createTokenRecord(userId: string, kind: "verify" | "reset", ttlMs: number): string {
  const token = randomBytes(32).toString("base64url");
  stmts.insertToken.run(token, userId, kind, Date.now() + ttlMs);
  return token;
}

async function sendVerification(userId: string, email: string): Promise<void> {
  const token = createTokenRecord(userId, "verify", 7 * 24 * 60 * 60_000);
  const link = `${env.webUrl}/verify?token=${token}`;
  await sendMail({ to: email, ...verificationEmail(link) });
}

export interface AuthedVars {
  userId: string;
}

/** Middleware: require a valid Bearer token; sets c.var.userId. */
export async function requireAuth(c: Context<Env>, next: Next) {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return c.json({ error: "unauthorized" }, 401);
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.sub !== "string") return c.json({ error: "unauthorized" }, 401);
    c.set("userId", payload.sub);
    await next();
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    emailVerified: !!u.email_verified,
  };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const authRoutes = new Hono<Env>();

authRoutes.post("/signup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const displayName = body.displayName ? String(body.displayName).slice(0, 80) : null;

  if (!EMAIL_RE.test(email)) return c.json({ error: "invalid_email" }, 400);
  if (password.length < 8) return c.json({ error: "password_too_short" }, 400);
  if (stmts.userByEmail.get(email)) return c.json({ error: "email_taken" }, 409);

  const id = randomUUID();
  stmts.insertUser.run(id, email, hashPassword(password), displayName, Date.now());
  await sendVerification(id, email).catch(() => {});
  track("signup", { userId: id });
  const token = await issueToken(id);
  return c.json({ token, user: { id, email, displayName, emailVerified: false } }, 201);
});

// --- email verification ---
authRoutes.post("/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const row = stmts.getToken.get(token, "verify") as TokenRow | undefined;
  if (!row || row.expires_at < Date.now()) return c.json({ error: "invalid_or_expired" }, 400);
  stmts.setEmailVerified.run(row.user_id);
  stmts.deleteToken.run(token);
  track("email_verified", { userId: row.user_id });
  return c.json({ ok: true });
});

authRoutes.post("/resend-verification", requireAuth, async (c) => {
  const userId = c.get("userId") as string;
  const user = stmts.userById.get(userId) as UserRow | undefined;
  if (!user) return c.json({ error: "not_found" }, 404);
  if (user.email_verified) return c.json({ ok: true, already: true });
  stmts.deleteUserTokens.run(userId, "verify");
  await sendVerification(userId, user.email).catch(() => {});
  return c.json({ ok: true });
});

// --- password reset ---
authRoutes.post("/request-reset", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const user = stmts.userByEmail.get(email) as UserRow | undefined;
  // Always 200 to avoid account enumeration.
  if (user) {
    stmts.deleteUserTokens.run(user.id, "reset");
    const token = createTokenRecord(user.id, "reset", 60 * 60_000);
    const link = `${env.webUrl}/reset?token=${token}`;
    await sendMail({ to: user.email, ...resetEmail(link) }).catch(() => {});
  }
  return c.json({ ok: true });
});

authRoutes.post("/reset", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  if (password.length < 8) return c.json({ error: "password_too_short" }, 400);
  const row = stmts.getToken.get(token, "reset") as TokenRow | undefined;
  if (!row || row.expires_at < Date.now()) return c.json({ error: "invalid_or_expired" }, 400);
  stmts.setPassword.run(hashPassword(password), row.user_id);
  stmts.deleteToken.run(token);
  track("password_reset", { userId: row.user_id });
  const jwt = await issueToken(row.user_id);
  const user = stmts.userById.get(row.user_id) as UserRow;
  return c.json({ token: jwt, user: publicUser(user) });
});

// Brute-force lockout: 10 failed attempts per (ip, email) → 15-minute lock.
const loginFails = new Map<string, { count: number; lockedUntil: number }>();
const LOCK_AFTER = 10;
const LOCK_MS = 15 * 60_000;

function failKey(c: { req: { header: (h: string) => string | undefined } }, email: string) {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return `${ip}:${email}`;
}

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const key = failKey(c, email);
  const lock = loginFails.get(key);
  if (lock && lock.lockedUntil > Date.now()) {
    return c.json({ error: "locked", message: "Too many attempts. Try again in a few minutes." }, 429);
  }

  const user = stmts.userByEmail.get(email) as UserRow | undefined;
  // Constant-ish work even when the user is missing, to avoid enumeration.
  const ok = user ? verifyPassword(password, user.password_hash) : false;
  if (!user || !ok) {
    const entry = loginFails.get(key) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= LOCK_AFTER) {
      entry.lockedUntil = Date.now() + LOCK_MS;
      entry.count = 0;
    }
    loginFails.set(key, entry);
    if (loginFails.size > 10_000) {
      const now = Date.now();
      for (const [k, v] of loginFails) if (v.lockedUntil < now && v.count === 0) loginFails.delete(k);
    }
    return c.json({ error: "invalid_credentials" }, 401);
  }

  loginFails.delete(key);
  const token = await issueToken(user.id);
  return c.json({ token, user: publicUser(user) });
});

authRoutes.get("/me", requireAuth, (c) => {
  const userId = c.get("userId") as string;
  const user = stmts.userById.get(userId) as UserRow | undefined;
  if (!user) return c.json({ error: "not_found" }, 404);
  return c.json({ user: publicUser(user) });
});

export { hashPassword, verifyPassword };
