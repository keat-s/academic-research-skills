import { useState } from "react";
import { api, ApiError, type SourceRef, type ExportFormat } from "../api";
import { downloadBlob } from "../download";

export function SourcesList({ sources }: { sources: SourceRef[] }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
      <button className="font-semibold text-indigo-300" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {sources.length} grounded source{sources.length > 1 ? "s" : ""}
      </button>
      {open && (
        <ol className="mt-2 space-y-1 pl-4 text-slate-400">
          {sources.map((s, i) => (
            <li key={i} className="list-decimal">
              {s.authors.slice(0, 2).join(", ")}
              {s.authors.length > 2 ? " et al." : ""}
              {s.year ? ` (${s.year})` : ""}. {s.title}
              {s.doi && (
                <>
                  {" "}
                  <a
                    className="text-indigo-300 hover:underline"
                    href={`https://doi.org/${s.doi}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    doi:{s.doi}
                  </a>
                </>
              )}
              <span className="ml-1 text-slate-600">[{s.source}]</span>
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
    <div className="relative mt-1 inline-block">
      <button className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setOpen(!open)}>
        ⤓ Export
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-36 rounded-lg border border-white/10 bg-[#0b1220] p-1 shadow-lg">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              className="block w-full rounded px-2 py-1 text-left text-xs text-slate-300 hover:bg-white/10"
              onClick={() => doExport(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {error && <div className="mt-1 text-[11px] text-amber-300">{error}</div>}
    </div>
  );
}
