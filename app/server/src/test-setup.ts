/**
 * Loaded via `--import tsx` before all test files so these env vars are set
 * before any module (env.ts, db.ts, index.ts) is evaluated. Must NOT import
 * any project module itself.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NODE_ENV = "test";
// Use a temp DB per test run so tests are hermetic and never clobber ./data/ars.db.
// The PID makes the path unique even if pnpm runs tests in parallel workers.
process.env.ARS_DB_PATH = join(tmpdir(), `ars-test-${process.pid}.db`);
// Low free limit so ratelimit tests don't need many iterations.
process.env.ARS_FREE_DAILY_MESSAGES = "3";
