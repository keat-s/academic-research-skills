import { Hono } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import type { Env } from "./types.js";
import { env } from "./env.js";
import { db, stmts, type UserRow } from "./db.js";

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

async function issueToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secret);
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

function publicUser(u: UserRow) {
  return { id: u.id, email: u.email, displayName: u.display_name };
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
  const token = await issueToken(id);
  return c.json({ token, user: { id, email, displayName } }, 201);
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const user = stmts.userByEmail.get(email) as UserRow | undefined;
  // Constant-ish work even when the user is missing, to avoid enumeration.
  const ok = user ? verifyPassword(password, user.password_hash) : false;
  if (!user || !ok) return c.json({ error: "invalid_credentials" }, 401);

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
