import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { stmts } from "./db.js";
import { requireAuth } from "./auth.js";
import { track } from "./analytics.js";
import { env } from "./env.js";
import type { Env } from "./types.js";

// Document upload for review / revision / citation-check modes. We extract
// plain text (PDF via unpdf; txt/md/tex/csv as-is) and persist ONLY the text —
// the original binary is never stored. Extracted text can then be attached to a
// chat turn by id (see ChatBody.uploadIds).

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_CHARS = 200_000; // cap injected context
const MAX_UPLOADS_PER_USER = 100;

export const uploadRoutes = new Hono<Env>();
uploadRoutes.use("*", requireAuth);

async function extractText(filename: string, mime: string, buf: Uint8Array): Promise<string> {
  const lower = filename.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    const { extractText: extract, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const { text } = await extract(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : text;
  }
  // Treat everything else as UTF-8 text (txt, md, tex, csv, json, bib…).
  return new TextDecoder().decode(buf);
}

uploadRoutes.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "no_file" }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: "too_large", maxBytes: MAX_BYTES }, 413);
  const { n } = stmts.countUploadsByUser.get(userId) as { n: number };
  if (n >= MAX_UPLOADS_PER_USER) {
    return c.json({ error: "upload_limit", message: "Upload limit reached — delete old documents first." }, 429);
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    text = (await extractText(file.name, file.type, buf)).slice(0, MAX_CHARS).trim();
  } catch {
    return c.json({ error: "extract_failed" }, 422);
  }
  if (!text) return c.json({ error: "empty_document" }, 422);

  // Enforce aggregate per-user upload byte budget. Check AFTER extraction so
  // we know the actual char count for the new document. The budget default is
  // ARS_UPLOAD_BUDGET_CHARS (default 5 000 000 chars ≈ 5 MB of text).
  const { total } = stmts.sumUploadCharsByUser.get(userId) as { total: number };
  if (total + text.length > env.uploadBudgetChars) {
    return c.json(
      {
        error: "upload_budget_exceeded",
        message: `Upload storage limit reached (${env.uploadBudgetChars.toLocaleString()} chars). Delete old documents first.`,
      },
      429
    );
  }

  const id = randomUUID();
  stmts.insertUpload.run(id, userId, file.name.slice(0, 200), file.type || "text/plain", text.length, text, Date.now());
  track("upload", { userId, meta: { chars: text.length } });
  return c.json({ id, filename: file.name, chars: text.length, preview: text.slice(0, 400) }, 201);
});

uploadRoutes.get("/", (c) => {
  const userId = c.get("userId") as string;
  return c.json({ uploads: stmts.uploadsByUser.all(userId) });
});

// Fetch one upload's extracted text (owner only) — used to inject document
// context on the in-browser WebLLM path, where the server doesn't see the turn.
uploadRoutes.get("/:id", (c) => {
  const userId = c.get("userId") as string;
  const row = stmts.uploadById.get(c.req.param("id"), userId) as
    | { id: string; filename: string; text: string }
    | undefined;
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ id: row.id, filename: row.filename, text: row.text });
});

uploadRoutes.delete("/:id", (c) => {
  const userId = c.get("userId") as string;
  stmts.deleteUpload.run(c.req.param("id"), userId);
  return c.json({ ok: true });
});

/** Fetch extracted text for a set of uploads owned by the user. */
export function loadUploadTexts(userId: string, ids: string[]): { filename: string; text: string }[] {
  const out: { filename: string; text: string }[] = [];
  for (const id of ids.slice(0, 5)) {
    const row = stmts.uploadById.get(id, userId) as { filename: string; text: string } | undefined;
    if (row) out.push({ filename: row.filename, text: row.text });
  }
  return out;
}
