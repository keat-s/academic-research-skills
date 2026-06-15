import { useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { api, ApiError, type SourceRef, type ExportFormat } from "../api";
import { downloadBlob } from "../download";

export function SourcesList({ sources }: { sources: SourceRef[] }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-border bg-[var(--surface-sunken)] p-2.5 text-xs">
      <button
        className="flex items-center gap-1.5 font-semibold text-[color:var(--accent-text)]"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
        <span className="font-mono text-[10px] uppercase tracking-[0.08em]">
          {sources.length} grounded source{sources.length > 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <ol className="mt-2.5 space-y-2.5 pl-0">
          {sources.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[10px] leading-none text-[color:var(--accent-text)]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {s.doi ? (
                  <a
                    href={`https://doi.org/${s.doi}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-foreground underline-offset-2 hover:underline"
                  >
                    {s.title}
                  </a>
                ) : (
                  <span className="font-semibold text-foreground">{s.title}</span>
                )}
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {[
                    s.authors.slice(0, 2).join(", ") + (s.authors.length > 2 ? " et al." : ""),
                    s.source,
                    s.year ? String(s.year) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {s.doi && (
                    <span className="ml-1 text-[color:var(--text-subtle)]">doi:{s.doi}</span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "md", label: "Markdown" },
  { id: "html", label: "HTML" },
  { id: "latex", label: "LaTeX" },
  { id: "rtf", label: "RTF (Word)" },
  { id: "docx", label: "DOCX" },
  { id: "pdf", label: "PDF" },
];

export function ExportMenu({ content, title }: { content: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function doExport(format: ExportFormat) {
    setError("");
    setOpen(false);
    try {
      const blob = await api.exportDoc(content, format, title);
      const ext = format === "latex" ? "tex" : format;
      downloadBlob(blob, `${(title || "export").replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}.${ext}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "pandoc_unavailable") {
        setError("DOCX/PDF need pandoc on the server. Try HTML, LaTeX, or RTF.");
      } else {
        setError("Export failed.");
      }
    }
  }

  return (
    <div className="relative inline-block">
      <button
        className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen(!open)}
      >
        <Download size={12} strokeWidth={2} />
        Export
      </button>
      {open && (
        <div className="absolute bottom-full z-10 mb-1 w-36 rounded-xl border border-border bg-card p-1 shadow-[var(--shadow-sm)]">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-secondary transition-colors"
              onClick={() => doExport(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {error && <div className="mt-1 text-[11px] text-[color:var(--ochre-500)]">{error}</div>}
    </div>
  );
}
