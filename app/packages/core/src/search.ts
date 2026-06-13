// Scholarly search for citation grounding. Uses free, key-less bibliographic
// APIs (Crossref, OpenAlex, Semantic Scholar) so the model can cite real works
// with real DOIs instead of hallucinating references — directly targeting the
// failure mode the parent suite is built around (Zhao et al. 2026).

export interface ScholarlyResult {
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
  source: "crossref" | "openalex" | "semanticscholar";
  abstract?: string;
}

const UA = "ARS-Studio/0.1 (academic research app; mailto:noreply@arsstudio.app)";

function timeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

async function safeJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function searchCrossref(query: string, limit = 5): Promise<ScholarlyResult[]> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}&select=title,author,issued,DOI,container-title,abstract,URL`;
  const json = await safeJson<{ message?: { items?: any[] } }>(url);
  const items = json?.message?.items ?? [];
  return items.map((it) => ({
    title: Array.isArray(it.title) ? it.title[0] ?? "Untitled" : it.title ?? "Untitled",
    authors: (it.author ?? []).map((a: any) => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean),
    year: it.issued?.["date-parts"]?.[0]?.[0],
    venue: Array.isArray(it["container-title"]) ? it["container-title"][0] : it["container-title"],
    doi: it.DOI,
    url: it.URL ?? (it.DOI ? `https://doi.org/${it.DOI}` : undefined),
    source: "crossref" as const,
    abstract: stripTags(it.abstract),
  }));
}

/** OpenAlex stores abstracts as an inverted index; reconstruct to plain text. */
function reconstructAbstract(inv?: Record<string, number[]>): string | undefined {
  if (!inv) return undefined;
  const positions: Array<[number, string]> = [];
  for (const [word, idxs] of Object.entries(inv)) for (const i of idxs) positions.push([i, word]);
  positions.sort((a, b) => a[0] - b[0]);
  const text = positions.map((p) => p[1]).join(" ");
  return text.length > 600 ? text.slice(0, 600) + "…" : text;
}

export async function searchOpenAlex(query: string, limit = 5): Promise<ScholarlyResult[]> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}`;
  const json = await safeJson<{ results?: any[] }>(url);
  const items = json?.results ?? [];
  return items.map((it) => ({
    title: it.title ?? it.display_name ?? "Untitled",
    authors: (it.authorships ?? []).map((a: any) => a.author?.display_name).filter(Boolean),
    year: it.publication_year,
    venue: it.primary_location?.source?.display_name,
    doi: it.doi?.replace(/^https?:\/\/doi\.org\//, ""),
    url: it.doi ?? it.id,
    source: "openalex" as const,
    abstract: reconstructAbstract(it.abstract_inverted_index),
  }));
}

export async function searchSemanticScholar(query: string, limit = 5): Promise<ScholarlyResult[]> {
  const fields = "title,authors,year,venue,externalIds,abstract,url";
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`;
  const json = await safeJson<{ data?: any[] }>(url);
  const items = json?.data ?? [];
  return items.map((it) => ({
    title: it.title ?? "Untitled",
    authors: (it.authors ?? []).map((a: any) => a.name).filter(Boolean),
    year: it.year,
    venue: it.venue,
    doi: it.externalIds?.DOI,
    url: it.url ?? (it.externalIds?.DOI ? `https://doi.org/${it.externalIds.DOI}` : undefined),
    source: "semanticscholar" as const,
    abstract: typeof it.abstract === "string" ? it.abstract.slice(0, 600) : undefined,
  }));
}

function stripTags(s?: string): string | undefined {
  if (!s) return undefined;
  const text = s.replace(/<[^>]+>/g, "").trim();
  return text.length > 600 ? text.slice(0, 600) + "…" : text;
}

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Run multiple providers, merge, and de-duplicate by DOI then normalized title. */
export async function searchScholarly(
  query: string,
  opts: { limit?: number; providers?: ScholarlyResult["source"][] } = {}
): Promise<ScholarlyResult[]> {
  const limit = opts.limit ?? 5;
  const providers = opts.providers ?? ["crossref", "openalex", "semanticscholar"];
  const runners: Record<string, () => Promise<ScholarlyResult[]>> = {
    crossref: () => searchCrossref(query, limit),
    openalex: () => searchOpenAlex(query, limit),
    semanticscholar: () => searchSemanticScholar(query, limit),
  };
  const settled = await Promise.allSettled(providers.map((p) => runners[p]!()));
  const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));

  const seen = new Set<string>();
  const merged: ScholarlyResult[] = [];
  for (const r of all) {
    if (!r.title) continue;
    const key = r.doi ? `doi:${r.doi.toLowerCase()}` : `t:${normTitle(r.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }
  return merged;
}

/** APA-ish single-line reference for a result. */
export function formatReference(r: ScholarlyResult): string {
  const authors = r.authors.length
    ? r.authors.length > 3
      ? `${r.authors[0]} et al.`
      : r.authors.join(", ")
    : "Unknown author";
  const year = r.year ? ` (${r.year})` : "";
  const venue = r.venue ? `. *${r.venue}*` : "";
  const doi = r.doi ? ` https://doi.org/${r.doi}` : r.url ? ` ${r.url}` : "";
  return `${authors}${year}. ${r.title}${venue}.${doi}`;
}

/** Build a context block of grounded sources to inject before generation. */
export function formatSourcesBlock(results: ScholarlyResult[]): string {
  if (results.length === 0) {
    return "GROUNDED SOURCES: (no results found for the generated queries — say so and do not fabricate citations).";
  }
  const lines = results.map((r, i) => {
    const ref = formatReference(r);
    const abs = r.abstract ? `\n   Abstract: ${r.abstract}` : "";
    return `[S${i + 1}] ${ref}${abs}`;
  });
  return [
    "GROUNDED SOURCES (retrieved live from Crossref / OpenAlex / Semantic Scholar).",
    "Cite ONLY these for empirical claims, referencing them by author–year with the DOI.",
    "If a needed claim is not covered here, say so explicitly — do NOT invent a citation.",
    "",
    ...lines,
  ].join("\n");
}
