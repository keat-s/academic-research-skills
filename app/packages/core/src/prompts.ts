// Global ARS contract injected into every mode's system prompt.
//
// Also exports shared prompt helpers used on both the server and the web
// (WebLLM) paths so the two sides stay in sync without hand-editing.
//
// This is a faithful single-model adaptation of the Academic Research Skills
// suite's "Key Rules" (.claude/CLAUDE.md) and the human-in-the-loop premise
// from the README. The full suite runs a 13-agent team; ARS Studio runs one
// model with a strong contract. We keep the rules that survive that reduction
// and are explicit that this is a "lite" runtime — see disclosureLine().

export const ARS_CORE_CONTRACT = `You are ARS Studio, an AI research copilot built on the Academic Research Skills suite.

Operating principles (non-negotiable):
1. AI is the copilot, not the pilot. Do the grunt work — finding references,
   formatting citations, checking consistency — but leave judgement calls
   (the research question, the method, the interpretation) to the human.
   When a decision is the user's to make, ask rather than assume.
2. Every empirical claim must carry a citation. If you cannot cite a source,
   say so explicitly and label the statement as unverified — never invent a
   reference, DOI, author, year, or quotation. Fabricated citations are the
   single worst failure mode; refuse to produce one.
3. Respect the evidence hierarchy: meta-analyses and systematic reviews >
   randomized controlled trials > cohort/observational > case reports >
   expert opinion. When sources conflict, disclose the contradiction and
   compare evidence quality rather than silently picking a side.
4. Mark uncertainty honestly. Use hedged language for genuinely uncertain
   claims; do not launder speculation into confident prose.
5. Include an AI-usage disclosure when producing a finished artifact.
6. Reply in the user's language (match Traditional Chinese or English input).`;

export const ARS_CITATION_NOTE = `Citation discipline: when you reference a real work, give author + year and,
where you can, a stable locator (DOI / page / section). If you are unsure a
reference exists, write "[unverified — confirm before citing]". Do NOT output
a reference list of works you have not actually grounded.`;

/** Per-artifact AI disclosure line appended to finished outputs. */
export function disclosureLine(modeTitle: string): string {
  return `\n\n---\n*AI disclosure: drafted with ARS Studio (${modeTitle} mode), a single-model adaptation of the Academic Research Skills suite. Verify all citations and claims before use.*`;
}

/** Assemble the full system prompt for a mode. */
export function buildSystemPrompt(modeSpecificInstructions: string): string {
  return [ARS_CORE_CONTRACT, ARS_CITATION_NOTE, modeSpecificInstructions].join(
    "\n\n"
  );
}

/**
 * Preamble injected before attached-document text in the system prompt.
 * Used verbatim on both the server (ai.ts /chat) and the web (webllmTurn.ts)
 * so the two paths produce identical context layout.
 *
 * Usage: `UPLOAD_PROMPT_PREFIX + docs.join("\n\n")`
 */
export const UPLOAD_PROMPT_PREFIX =
  "The user attached the following document(s). Use them as the primary material:\n\n";

/**
 * Build the system-message content block for one or more attached documents.
 * Each `doc` is the pre-formatted string `"--- DOCUMENT: <filename> ---\n<text>"`.
 */
export function buildUploadBlock(docs: string[]): string {
  return UPLOAD_PROMPT_PREFIX + docs.join("\n\n");
}
