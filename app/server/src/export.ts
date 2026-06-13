import { Hono } from "hono";
import { spawn } from "node:child_process";
import { convert, EXPORT_MIME, type ExportFormat } from "@ars/core";
import { requireAuth } from "./auth.js";
import { track } from "./analytics.js";
import type { Env } from "./types.js";

// Document export. md/html/latex/rtf are produced by the pure core converters
// (always available). docx/pdf require pandoc on PATH; when absent we return a
// clear 501 so the client can fall back to an always-available format.

const TEXT_FORMATS: ExportFormat[] = ["md", "html", "latex", "rtf"];

export const exportRoutes = new Hono<Env>();
exportRoutes.use("*", requireAuth);

function pandocAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("pandoc", ["--version"]);
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

function runPandoc(markdown: string, to: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn("pandoc", ["-f", "markdown", "-t", to, "-o", "-"]);
    const chunks: Buffer[] = [];
    p.stdout.on("data", (d) => chunks.push(d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error("pandoc_failed"))));
    p.stdin.write(markdown);
    p.stdin.end();
  });
}

exportRoutes.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({}));
  const markdown = String(body.markdown ?? "");
  const format = String(body.format ?? "md");
  const title = body.title ? String(body.title).slice(0, 120) : "ARS Studio export";
  if (!markdown.trim()) return c.json({ error: "empty" }, 400);

  const filenameBase = (title || "export").replace(/[^a-z0-9\-_]+/gi, "_").slice(0, 60);

  // Always-available text formats.
  if (TEXT_FORMATS.includes(format as ExportFormat)) {
    const out = convert(markdown, format as ExportFormat, title);
    track("export", { userId, meta: { format } });
    return new Response(out, {
      headers: {
        "Content-Type": EXPORT_MIME[format as ExportFormat],
        "Content-Disposition": `attachment; filename="${filenameBase}.${format === "latex" ? "tex" : format}"`,
      },
    });
  }

  // docx / pdf via pandoc.
  if (format === "docx" || format === "pdf") {
    if (!(await pandocAvailable())) {
      return c.json(
        { error: "pandoc_unavailable", message: "Install pandoc (and a LaTeX engine for PDF) to export this format, or choose HTML/LaTeX/RTF." },
        501
      );
    }
    try {
      const buf = await runPandoc(markdown, format);
      track("export", { userId, meta: { format } });
      const mime = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": mime,
          "Content-Disposition": `attachment; filename="${filenameBase}.${format}"`,
        },
      });
    } catch {
      return c.json({ error: "convert_failed" }, 500);
    }
  }

  return c.json({ error: "unsupported_format" }, 400);
});
