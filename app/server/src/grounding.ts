import {
  chatComplete,
  searchScholarly,
  formatSourcesBlock,
  type ChatMessage,
  type ScholarlyResult,
} from "@ars/core";
import { env } from "./env.js";

// Citation grounding via a deterministic RAG pre-pass (works on any model,
// including free ones with no tool-calling). Before the main answer streams:
//   1. ask the model for up to 3 scholarly search queries,
//   2. run them against Crossref / OpenAlex / Semantic Scholar,
//   3. inject the retrieved real references as context.
// The main generation is then instructed to cite only those sources.

export interface GroundingResult {
  sources: ScholarlyResult[];
  contextMessage: ChatMessage | null;
  queries: string[];
}

const QUERY_SYSTEM = `You generate scholarly database search queries.
Given a user's research request, output 1-3 short keyword queries (not questions)
that would find relevant peer-reviewed sources. Reply with ONLY a JSON array of
strings, e.g. ["query one","query two"]. No prose.`;

function parseQueries(raw: string, fallback: string): string[] {
  // Pull the first JSON array out of the model output.
  const match = raw.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) {
        const qs = arr.map((q) => String(q).trim()).filter((q) => q.length > 1).slice(0, 3);
        if (qs.length) return qs;
      }
    } catch {
      /* fall through */
    }
  }
  return [fallback.slice(0, 200)];
}

export async function ground(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<GroundingResult> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUser?.content ?? "";
  if (!userText.trim()) return { sources: [], contextMessage: null, queries: [] };

  let queries: string[];
  try {
    const raw = await chatComplete(
      { apiKey, referer: env.publicUrl, title: "ARS Studio" },
      {
        model,
        messages: [
          { role: "system", content: QUERY_SYSTEM },
          { role: "user", content: userText.slice(0, 2000) },
        ],
        temperature: 0,
        maxTokens: 120,
      },
      signal
    );
    queries = parseQueries(raw, userText);
  } catch {
    // If query generation fails, fall back to the raw user text as one query.
    queries = [userText.slice(0, 200)];
  }

  const perQuery = await Promise.all(queries.map((q) => searchScholarly(q, { limit: 4 })));
  // Merge + dedup across queries by DOI/title.
  const seen = new Set<string>();
  const sources: ScholarlyResult[] = [];
  for (const r of perQuery.flat()) {
    const key = r.doi ? `doi:${r.doi.toLowerCase()}` : `t:${r.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(r);
    if (sources.length >= 10) break;
  }

  const contextMessage: ChatMessage = { role: "system", content: formatSourcesBlock(sources) };
  return { sources, contextMessage, queries };
}
