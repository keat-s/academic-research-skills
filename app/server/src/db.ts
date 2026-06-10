import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "./env.js";

mkdirSync(dirname(env.sqlitePath), { recursive: true });

export const db = new Database(env.sqlitePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

-- Per-user, per-UTC-day counter for the shared-key free tier.
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     TEXT NOT NULL,         -- YYYY-MM-DD (UTC)
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Single-use tokens for email verification + password reset.
CREATE TABLE IF NOT EXISTS auth_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,          -- 'verify' | 'reset'
  expires_at INTEGER NOT NULL
);

-- Linked OAuth identities.
CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider         TEXT NOT NULL,    -- 'google' | 'github'
  provider_user_id TEXT NOT NULL,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at       INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);

-- Privacy-preserving usage events (no message content, no PII).
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT,                   -- nullable; hashed elsewhere if needed
  name       TEXT NOT NULL,          -- e.g. 'chat', 'signup', 'export'
  mode_id    TEXT,
  meta       TEXT,                   -- small JSON, no content
  created_at INTEGER NOT NULL
);

-- Uploaded documents (extracted text only; originals are not retained).
CREATE TABLE IF NOT EXISTS uploads (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  chars      INTEGER NOT NULL,
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON auth_tokens(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(name, created_at);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id, created_at DESC);
`);

// Lightweight additive migration: add columns introduced after the initial
// schema. Guarded so re-running is a no-op.
function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn("users", "email_verified", "email_verified INTEGER NOT NULL DEFAULT 0");

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: number;
  email_verified?: number;
}

export const stmts = {
  insertUser: db.prepare(
    "INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)"
  ),
  userByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  userById: db.prepare("SELECT * FROM users WHERE id = ?"),

  insertConversation: db.prepare(
    "INSERT INTO conversations (id, user_id, mode_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ),
  touchConversation: db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?"),
  conversationsByUser: db.prepare(
    "SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100"
  ),
  conversationById: db.prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?"),
  deleteConversation: db.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?"),

  insertMessage: db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)"
  ),
  messagesByConversation: db.prepare(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at"
  ),
  // k-th user message (1-based) of a conversation — anchor for truncation.
  kthUserMessageAt: db.prepare(
    "SELECT created_at FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at LIMIT 1 OFFSET ?"
  ),
  deleteMessagesFrom: db.prepare(
    "DELETE FROM messages WHERE conversation_id = ? AND created_at >= ?"
  ),

  getUsage: db.prepare("SELECT count FROM usage_daily WHERE user_id = ? AND day = ?"),
  upsertUsage: db.prepare(`
    INSERT INTO usage_daily (user_id, day, count) VALUES (?, ?, 1)
    ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1
  `),

  setEmailVerified: db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?"),
  setPassword: db.prepare("UPDATE users SET password_hash = ? WHERE id = ?"),

  insertToken: db.prepare(
    "INSERT INTO auth_tokens (token, user_id, kind, expires_at) VALUES (?, ?, ?, ?)"
  ),
  getToken: db.prepare("SELECT * FROM auth_tokens WHERE token = ? AND kind = ?"),
  deleteToken: db.prepare("DELETE FROM auth_tokens WHERE token = ?"),
  deleteUserTokens: db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?"),

  oauthAccount: db.prepare(
    "SELECT * FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?"
  ),
  insertOauthAccount: db.prepare(
    "INSERT INTO oauth_accounts (provider, provider_user_id, user_id, created_at) VALUES (?, ?, ?, ?)"
  ),

  insertEvent: db.prepare(
    "INSERT INTO events (user_id, name, mode_id, meta, created_at) VALUES (?, ?, ?, ?, ?)"
  ),
  eventCounts: db.prepare(
    "SELECT name, COUNT(*) as n FROM events WHERE created_at >= ? GROUP BY name ORDER BY n DESC"
  ),

  insertUpload: db.prepare(
    "INSERT INTO uploads (id, user_id, filename, mime, chars, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
  uploadsByUser: db.prepare(
    "SELECT id, filename, mime, chars, created_at FROM uploads WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
  ),
  countUploadsByUser: db.prepare("SELECT COUNT(*) AS n FROM uploads WHERE user_id = ?"),
  uploadById: db.prepare("SELECT * FROM uploads WHERE id = ? AND user_id = ?"),
  deleteUpload: db.prepare("DELETE FROM uploads WHERE id = ? AND user_id = ?"),
};

export interface TokenRow {
  token: string;
  user_id: string;
  kind: string;
  expires_at: number;
}
