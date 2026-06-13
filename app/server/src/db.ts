import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "./env.js";

mkdirSync(dirname(env.sqlitePath), { recursive: true });

export const db = new Database(env.sqlitePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// --- better-auth owned tables -------------------------------------------------
// better-auth owns user/account/session/verification (+ subscription via the
// stripe plugin). We pin the generated schema here as idempotent
// CREATE TABLE IF NOT EXISTS so a fresh DB (or a shared dev DB) boots without a
// separate CLI migrate step. The shapes mirror `@better-auth/cli generate` for
// the better-sqlite3 adapter + bearer + stripe plugins (better-auth 1.6.x).
//   - timestamps are stored as INTEGER ms (the adapter's timestamp_ms mode).
//   - `user.stripeCustomerId` is added by the stripe plugin.
//   - `subscription` is added by the stripe plugin.
db.exec(`
CREATE TABLE IF NOT EXISTS user (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL UNIQUE,
  emailVerified   INTEGER NOT NULL DEFAULT 0,
  image           TEXT,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL,
  stripeCustomerId TEXT
);

CREATE TABLE IF NOT EXISTS session (
  id        TEXT PRIMARY KEY,
  expiresAt INTEGER NOT NULL,
  token     TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_userId_idx ON session(userId);

CREATE TABLE IF NOT EXISTS account (
  id                    TEXT PRIMARY KEY,
  accountId             TEXT NOT NULL,
  providerId            TEXT NOT NULL,
  userId                TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken           TEXT,
  refreshToken          TEXT,
  idToken               TEXT,
  accessTokenExpiresAt  INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope                 TEXT,
  password              TEXT,
  createdAt             INTEGER NOT NULL,
  updatedAt             INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_userId_idx ON account(userId);

CREATE TABLE IF NOT EXISTS verification (
  id         TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value      TEXT NOT NULL,
  expiresAt  INTEGER NOT NULL,
  createdAt  INTEGER NOT NULL,
  updatedAt  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

CREATE TABLE IF NOT EXISTS subscription (
  id                   TEXT PRIMARY KEY,
  plan                 TEXT NOT NULL,
  referenceId          TEXT NOT NULL,
  stripeCustomerId     TEXT,
  stripeSubscriptionId TEXT,
  status               TEXT NOT NULL DEFAULT 'incomplete',
  periodStart          INTEGER,
  periodEnd            INTEGER,
  cancelAtPeriodEnd    INTEGER,
  cancelAt             INTEGER,
  canceledAt           INTEGER,
  endedAt              INTEGER,
  seats                INTEGER,
  trialStart           INTEGER,
  trialEnd             INTEGER,
  billingInterval      TEXT,
  stripeScheduleId     TEXT
);
CREATE INDEX IF NOT EXISTS subscription_referenceId_idx ON subscription(referenceId);
`);

// --- domain tables ------------------------------------------------------------
// FKs point at better-auth's `user(id)`. Migrated user ids are preserved, so
// existing rows stay valid. `events` keeps a free-form (nullable) user_id.
db.exec(`
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
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
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  day     TEXT NOT NULL,         -- YYYY-MM-DD (UTC)
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
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
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  chars      INTEGER NOT NULL,
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(name, created_at);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id, created_at DESC);
`);

// --- legacy (pre-better-auth) tables ------------------------------------------
// These hold the old custom-JWT auth data. They are NOT created on a fresh DB;
// they only exist on a DB that predates the big-bang migration. `migrate_to_
// better_auth.ts` copies their rows into better-auth's user/account tables and
// then drops them. The prepared statements below are kept solely so the
// migration script can read legacy rows; nothing else references them.
function tableExists(name: string): boolean {
  return !!db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name);
}

const hasLegacyUsers = tableExists("users");
const hasLegacyOauth = tableExists("oauth_accounts");

export interface LegacyUserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: number;
  email_verified?: number;
}

export interface LegacyOauthRow {
  provider: string;
  provider_user_id: string;
  user_id: string;
  created_at: number;
}

export const legacyStmts = {
  hasLegacyUsers,
  hasLegacyOauth,
  allUsers: hasLegacyUsers
    ? db.prepare("SELECT * FROM users")
    : null,
  allOauth: hasLegacyOauth
    ? db.prepare("SELECT * FROM oauth_accounts")
    : null,
};

// --- domain prepared statements ----------------------------------------------
export const stmts = {
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

  // Active "supporter" subscription lookup (drives the raised free quota).
  activeSubscription: db.prepare(
    "SELECT 1 FROM subscription WHERE referenceId = ? AND plan = ? AND status IN ('active','trialing') LIMIT 1"
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
