// Pragmatic Markdown converters for document export. Pure functions (no deps)
// so they run identically on server and client and are unit-testable. They
// cover the subset that research output uses — headings, emphasis, code, lists,
// blockquotes, links, paragraphs. For full-fidelity DOCX/PDF the server can
// shell out to pandoc when present; these are the always-available fallbacks.

export type ExportFormat = "md" | "html" | "latex" | "rtf";

export const EXPORT_MIME: Record<ExportFormat, string> = {
  md: "text/markdown",
  html: "text/html",
  latex: "application/x-tex",
  rtf: "application/rtf",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineHtml(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/** Minimal block-level markdown → HTML body. */
export function toHtmlBody(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList = false;
  let inCode = false;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inlineHtml(para.join(" "))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushPara();
      closeList();
      if (!inCode) {
        out.push("<pre><code>");
        inCode = true;
      } else {
        out.push("</code></pre>");
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(line));
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      closeList();
      const level = heading[1]!.length;
      out.push(`<h${level}>${inlineHtml(heading[2]!)}</h${level}>`);
      continue;
    }
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      flushPara();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inlineHtml(li[1]!)}</li>`);
      continue;
    }
    if (line.trim().startsWith(">")) {
      flushPara();
      closeList();
      out.push(`<blockquote>${inlineHtml(line.replace(/^\s*>\s?/, ""))}</blockquote>`);
      continue;
    }
    if (line.trim() === "") {
      flushPara();
      closeList();
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  closeList();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

export function toHtml(md: string, title = "ARS Studio export"): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:Georgia,serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.6}code{background:#f0f0f0;padding:.1em .3em;border-radius:3px}pre{background:#f6f8fa;padding:1rem;overflow:auto}blockquote{border-left:3px solid #ccc;margin:0;padding-left:1rem;color:#555}</style>
</head><body>
${toHtmlBody(md)}
</body></html>`;
}

function escapeLatex(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function inlineLatex(s: string): string {
  // Apply emphasis before escaping the remainder, protecting the markers.
  return escapeLatex(s)
    .replace(/\*\*([^*]+)\*\*/g, "\\textbf{$1}")
    .replace(/\*([^*]+)\*/g, "\\emph{$1}")
    .replace(/`([^`]+)`/g, "\\texttt{$1}")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "\\href{$2}{$1}");
}

export function toLatex(md: string, title = "ARS Studio export"): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const body: string[] = [];
  const sect = ["section", "subsection", "subsubsection", "paragraph", "subparagraph", "subparagraph"];
  let inList = false;
  const closeList = () => {
    if (inList) {
      body.push("\\end{itemize}");
      inList = false;
    }
  };
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1]!.length, 6) - 1;
      body.push(`\\${sect[level]}{${inlineLatex(heading[2]!)}}`);
      continue;
    }
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (!inList) {
        body.push("\\begin{itemize}");
        inList = true;
      }
      body.push(`  \\item ${inlineLatex(li[1]!)}`);
      continue;
    }
    if (line.trim() === "") {
      closeList();
      body.push("");
      continue;
    }
    closeList();
    body.push(inlineLatex(line.trim()));
  }
  closeList();
  return `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{hyperref}
\\title{${escapeLatex(title)}}
\\begin{document}
\\maketitle
${body.join("\n")}
\\end{document}`;
}

/** Minimal RTF (opens in Word/Pages). Bold + paragraphs; strips other markup. */
export function toRtf(md: string): string {
  const esc = (s: string) =>
    s.replace(/[\\{}]/g, "\\$&").replace(/[-￿]/g, (ch) => `\\u${ch.charCodeAt(0)}?`);
  const paras = md
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => {
      const bold = p.match(/^(#{1,6})\s+(.*)$/);
      const text = bold ? bold[2]! : p.replace(/\n/g, " ");
      const inner = esc(text)
        .replace(/\*\*([^*]+)\*\*/g, "{\\b $1}")
        .replace(/\*([^*]+)\*/g, "{\\i $1}");
      return bold ? `{\\b\\fs28 ${inner}}\\par` : `${inner}\\par`;
    });
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Georgia;}}\\fs24\n${paras.join("\n")}\n}`;
}

export function convert(md: string, format: ExportFormat, title?: string): string {
  switch (format) {
    case "md":
      return md;
    case "html":
      return toHtml(md, title);
    case "latex":
      return toLatex(md, title);
    case "rtf":
      return toRtf(md);
  }
}
