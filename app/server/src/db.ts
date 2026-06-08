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

CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
`);

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: number;
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

  getUsage: db.prepare("SELECT count FROM usage_daily WHERE user_id = ? AND day = ?"),
  upsertUsage: db.prepare(`
    INSERT INTO usage_daily (user_id, day, count) VALUES (?, ?, 1)
    ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1
  `),
};
