/**
 * One-shot, idempotent migration from the legacy custom-JWT auth schema to
 * better-auth's tables. Safe to re-run (INSERT OR IGNORE everywhere).
 *
 *   legacy `users`          → better-auth `user` (+ `account` credential row)
 *   legacy `oauth_accounts` → better-auth `account` (social rows)
 *
 * User ids are preserved verbatim, so the domain tables (conversations,
 * messages, usage_daily, uploads) — whose FKs were repointed to `user(id)` —
 * keep referencing the same ids.
 *
 * Run with:  tsx src/migrate_to_better_auth.ts
 * (honours ARS_DB_PATH so it can target an isolated test DB.)
 *
 * After a successful run the legacy tables (`users`, `oauth_accounts`,
 * `auth_tokens`) are dropped — better-auth provides verification + reset.
 */
import { randomUUID } from "node:crypto";
import { db, legacyStmts, type LegacyUserRow, type LegacyOauthRow } from "./db.js";

interface MigrationCounts {
  users: number;
  credentialAccounts: number;
  oauthAccounts: number;
}

export function migrateToBetterAuth(): MigrationCounts {
  const counts: MigrationCounts = { users: 0, credentialAccounts: 0, oauthAccounts: 0 };

  if (!legacyStmts.hasLegacyUsers && !legacyStmts.hasLegacyOauth) {
    return counts; // nothing to migrate (fresh better-auth DB)
  }

  // better-auth stores timestamps as INTEGER ms; reuse the legacy created_at so
  // ordering is preserved, falling back to now() when absent.
  const insertUser = db.prepare(
    `INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertAccount = db.prepare(
    `INSERT OR IGNORE INTO account
       (id, accountId, providerId, userId, password, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const accountExists = db.prepare(
    "SELECT 1 FROM account WHERE providerId = ? AND accountId = ? LIMIT 1"
  );

  const run = db.transaction(() => {
    if (legacyStmts.allUsers) {
      const users = legacyStmts.allUsers.all() as LegacyUserRow[];
      for (const u of users) {
        const now = u.created_at ?? Date.now();
        insertUser.run(
          u.id,
          u.display_name ?? "",
          u.email,
          u.email_verified ? 1 : 0,
          now,
          now
        );
        counts.users += 1;

        // Credential account carries the legacy scrypt hash verbatim; the custom
        // emailAndPassword.verify in auth.ts understands the "<salt>:<hash>" form.
        // A 64-char-double placeholder hash for OAuth-only users is fine to carry
        // over (it just won't ever verify), but we keep it simple and copy it.
        if (!accountExists.get("credential", u.id)) {
          insertAccount.run(randomUUID(), u.id, "credential", u.id, u.password_hash, now, now);
          counts.credentialAccounts += 1;
        }
      }
    }

    if (legacyStmts.allOauth) {
      const oauth = legacyStmts.allOauth.all() as LegacyOauthRow[];
      for (const o of oauth) {
        const now = o.created_at ?? Date.now();
        if (!accountExists.get(o.provider, o.provider_user_id)) {
          insertAccount.run(
            randomUUID(),
            o.provider_user_id,
            o.provider,
            o.user_id,
            null,
            now,
            now
          );
          counts.oauthAccounts += 1;
        }
      }
    }
  });

  run();

  // Drop the legacy tables now that their rows live in better-auth. Guarded so a
  // re-run (after they're already gone) is a no-op. `auth_tokens` is obsolete —
  // better-auth owns verification + reset via the `verification` table.
  db.exec(`
    DROP TABLE IF EXISTS auth_tokens;
    DROP TABLE IF EXISTS oauth_accounts;
    DROP TABLE IF EXISTS users;
  `);

  return counts;
}

// Allow `tsx src/migrate_to_better_auth.ts` as a CLI entrypoint.
const invokedDirectly =
  process.argv[1] && process.argv[1].endsWith("migrate_to_better_auth.ts");
if (invokedDirectly) {
  const counts = migrateToBetterAuth();
  // eslint-disable-next-line no-console
  console.log(
    `[migrate_to_better_auth] users=${counts.users} credentialAccounts=${counts.credentialAccounts} oauthAccounts=${counts.oauthAccounts} (legacy tables dropped)`
  );
}
