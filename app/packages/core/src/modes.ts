import type { Mode } from "./types.js";
import { buildSystemPrompt } from "./prompts.js";

// Ported from MODE_REGISTRY.md (v3.10.0, 25 modes across 4 skills).
// Each mode carries a mode-specific instruction block that adapts the skill's
// intent to a single-model runtime. The orchestration nuance of the full
// 13-agent suite is summarized, not reproduced.

interface ModeDef extends Mode {
  /** Mode-specific instruction block (combined with the core contract at runtime). */
  instructions: string;
}

const RAW: ModeDef[] = [
  // ---------------------------------------------------------------- deep-research
  {
    id: "deep-research:full",
    skill: "deep-research",
    mode: "full",
    title: "Deep Research",
    blurb: "Rigorous, multi-source research report on any topic (APA 7.0).",
    spectrum: "Balanced",
    oversight: "High",
    output: "APA 7.0 report, 3,000–8,000 words",
    triggers: ["research", "deep research", "academic analysis"],
    conversational: false,
    instructions: `Mode: deep-research / full. Produce a rigorous research report.
Structure: Research Question → Methodology note → Synthesis of evidence
(grouped by theme, not by source) → Contradictions & gaps → Conclusion →
References. Aim for 3,000–8,000 words for a full treatment, but confirm scope
with the user first if the topic is broad. Foreground the strongest evidence;
flag where the literature is thin. Use APA 7.0 in-text citations and a
reference list of only sources you can stand behind.`,
  },
  {
    id: "deep-research:quick",
    skill: "deep-research",
    mode: "quick",
    title: "Quick Brief",
    blurb: "A fast 500–1,500 word research brief.",
    spectrum: "Fidelity",
    oversight: "Medium",
    output: "Research brief, 500–1,500 words",
    triggers: ["quick brief", "30 minute summary", "quick research"],
    conversational: false,
    instructions: `Mode: deep-research / quick. Produce a tight 500–1,500 word brief:
key findings up front, 3–6 themes, explicit "what we don't know yet" section,
and a short source list. Prioritize signal over completeness.`,
  },
  {
    id: "deep-research:review",
    skill: "deep-research",
    mode: "review",
    title: "Source Review",
    blurb: "Reviewer report evaluating a provided text or source.",
    spectrum: "Balanced",
    oversight: "High",
    output: "Reviewer report on provided text",
    triggers: ["review this paper", "evaluate this paper", "assess this source"],
    conversational: false,
    instructions: `Mode: deep-research / review. The user provides a text or source.
Evaluate it: claim validity, evidence quality, methodology soundness, logical
consistency, and citation integrity. Separate "fatal" from "minor" issues.
Be specific and quote the passage you are critiquing.`,
  },
  {
    id: "deep-research:lit-review",
    skill: "deep-research",
    mode: "lit-review",
    title: "Literature Review (research)",
    blurb: "Annotated bibliography + cross-source synthesis.",
    spectrum: "Fidelity",
    oversight: "Medium",
    output: "Annotated bibliography + synthesis",
    triggers: ["literature review", "annotated bibliography"],
    conversational: false,
    instructions: `Mode: deep-research / lit-review. Produce (1) an annotated
bibliography — each entry: full citation, 2–4 sentence annotation covering
method, finding, and relevance; and (2) a synthesis that maps agreements,
disagreements, and gaps across the corpus. Do not pad with sources you cannot
verify.`,
  },
  {
    id: "deep-research:fact-check",
    skill: "deep-research",
    mode: "fact-check",
    title: "Fact-Check",
    blurb: "Claim-by-claim verification report.",
    spectrum: "Fidelity",
    oversight: "Medium",
    output: "Claim-by-claim verification report",
    triggers: ["verify claims", "fact-check", "evidence verification"],
    conversational: false,
    instructions: `Mode: deep-research / fact-check. Extract each discrete factual
claim from the user's text. For each: state the claim, your verdict
(Supported / Partially supported / Unsupported / Unverifiable), the evidence,
and a confidence note. Never assert "verified" without a citable basis.`,
  },
  {
    id: "deep-research:socratic",
    skill: "deep-research",
    mode: "socratic",
    title: "Socratic Research Guide",
    blurb: "Guided dialogue to clarify your research question.",
    spectrum: "Originality",
    oversight: "Very High",
    output: "Research Plan Summary + INSIGHT collection",
    triggers: ["guide my research", "help me think through", "I'm not sure what to research"],
    conversational: true,
    instructions: `Mode: deep-research / socratic. This is a DIALOGUE, not a report.
Ask one focused question at a time to help the user sharpen their research
question. Do not converge prematurely or hand them a finished question — draw
it out of them. Periodically capture INSIGHTs (things the user realized). When
the question is sharp enough, summarize it as a Research Plan Summary and ask
if they're ready to proceed.`,
  },
  {
    id: "deep-research:systematic-review",
    skill: "deep-research",
    mode: "systematic-review",
    title: "Systematic Review",
    blurb: "PRISMA 2020 systematic review, optional meta-analysis.",
    spectrum: "Fidelity",
    oversight: "Medium",
    output: "PRISMA 2020 report, 5,000–15,000 words",
    triggers: ["systematic review", "meta-analysis", "PRISMA"],
    conversational: false,
    instructions: `Mode: deep-research / systematic-review. Follow PRISMA 2020:
eligibility criteria, search strategy, screening (with a PRISMA flow summary),
risk-of-bias assessment, and synthesis. If a meta-analysis is appropriate and
the user supplies extractable data, describe the pooling approach — but never
fabricate effect sizes. Be explicit about what a single-model run cannot
replace (dual independent screening, full-text retrieval).`,
  },

  // ---------------------------------------------------------------- academic-paper
  {
    id: "academic-paper:full",
    skill: "academic-paper",
    mode: "full",
    title: "Write Paper",
    blurb: "Complete paper draft (IMRaD or domain-appropriate).",
    spectrum: "Balanced",
    oversight: "High",
    output: "Complete paper draft",
    triggers: ["write a paper", "academic paper", "research paper"],
    conversational: false,
    instructions: `Mode: academic-paper / full. Draft a complete paper from the
user's materials. Use IMRaD unless the domain calls for another structure
(confirm if unsure). Write in the user's voice, not generic AI prose: vary
sentence length, cut throat-clearing openers, avoid AI-tell filler. Every
empirical claim cites a source the user provided or that you can ground. Mark
any gap where the user must supply data or a decision.`,
  },
  {
    id: "academic-paper:plan",
    skill: "academic-paper",
    mode: "plan",
    title: "Plan Paper (Socratic)",
    blurb: "Chapter-by-chapter guided planning dialogue.",
    spectrum: "Originality",
    oversight: "Very High",
    output: "Chapter Plan + INSIGHT collection",
    command: "/ars-plan",
    triggers: ["guide my paper", "help me plan", "step by step paper"],
    conversational: true,
    instructions: `Mode: academic-paper / plan. DIALOGUE mode. Walk the user
through their paper's structure one section at a time via Socratic questions —
what is the argument of this chapter? what evidence carries it? what's the
transition? Build a Chapter Plan collaboratively. Capture INSIGHTs. Don't write
the paper; help them architect it.`,
  },
  {
    id: "academic-paper:outline-only",
    skill: "academic-paper",
    mode: "outline-only",
    title: "Outline",
    blurb: "Detailed outline + evidence map.",
    spectrum: "Balanced",
    oversight: "High",
    output: "Detailed outline + evidence map",
    command: "/ars-outline",
    triggers: ["paper outline", "just need an outline"],
    conversational: false,
    instructions: `Mode: academic-paper / outline-only. Produce a hierarchical
outline (section → subsection → key point) and an evidence map pairing each
claim slot with the source that would support it. Flag claim slots that have no
supporting source yet.`,
  },
  {
    id: "academic-paper:revision",
    skill: "academic-paper",
    mode: "revision",
    title: "Revise Paper",
    blurb: "Revised draft + point-by-point R&R responses.",
    spectrum: "Fidelity",
    oversight: "High",
    output: "Revised draft + point-by-point responses",
    command: "/ars-revision",
    triggers: ["revise paper", "incorporate reviewer feedback"],
    conversational: false,
    instructions: `Mode: academic-paper / revision. The user supplies a draft and
reviewer comments. Produce (1) a revised draft and (2) a point-by-point
response letter: quote each reviewer point, state the change made, and cite the
location. Do not claim a change you didn't make.`,
  },
  {
    id: "academic-paper:revision-coach",
    skill: "academic-paper",
    mode: "revision-coach",
    title: "Revision Coach",
    blurb: "Parse reviewer comments into a roadmap + response skeleton.",
    spectrum: "Balanced",
    oversight: "Medium",
    output: "Revision Roadmap + Response Letter Skeleton",
    command: "/ars-revision-coach",
    triggers: ["parse reviews", "I got reviewer comments"],
    conversational: false,
    instructions: `Mode: academic-paper / revision-coach. Parse the reviewer
comments into a prioritized Revision Roadmap (what to change, effort, risk) and
a Response Letter skeleton with a stub per comment. Coach the strategy; leave
the actual writing to the user or the revision mode.`,
  },
  {
    id: "academic-paper:abstract-only",
    skill: "academic-paper",
    mode: "abstract-only",
    title: "Abstract",
    blurb: "Bilingual abstract (zh-TW + EN) + keywords.",
    spectrum: "Fidelity",
    oversight: "Medium",
    output: "Bilingual abstract + keywords",
    command: "/ars-abstract",
    triggers: ["write abstract"],
    conversational: false,
    instructions: `Mode: academic-paper / abstract-only. From the paper or its
key results, write a structured abstract (background, method, results,
conclusion) in both English and Traditional Chinese, plus 4–6 keywords in each
language. Keep claims to what the paper actually supports.`,
  },
  {
    id: "academic-paper:lit-review",
    skill: "academic-paper",
    mode: "lit-review",
    title: "Literature Review (paper)",
    blurb: "Annotated bibliography rendered as a lit-review section.",
    spectrum: "Fidelity",
    oversight: "Medium",
    output: "Annotated bibliography in paper format",
    command: "/ars-lit-review",
    triggers: ["literature review paper", "write a lit review"],
    conversational: false,
    instructions: `Mode: academic-paper / lit-review. Render a literature review
SECTION (prose, thematically organized, publication-ready) rather than a bare
bibliography. Synthesize; don't list. Cite only verifiable sources.`,
  },
  {
    id: "academic-paper:format-convert",
    skill: "academic-paper",
    mode: "format-convert",
    title: "Format Convert",
    blurb: "Convert to LaTeX / DOCX-via-Pandoc / PDF / Markdown.",
    spectrum: "Fidelity",
    oversight: "Low",
    output: "Formatted document",
    command: "/ars-format-convert",
    triggers: ["convert to LaTeX", "convert citations to format"],
    conversational: false,
    instructions: `Mode: academic-paper / format-convert. Convert the supplied
document or citations to the requested format (LaTeX, Markdown, or a
Pandoc-ready source). Preserve content exactly; change only structure and
markup. Note any element that needs a tool the app can't run (e.g. PDF
typesetting).`,
  },
  {
    id: "academic-paper:citation-check",
    skill: "academic-paper",
    mode: "citation-check",
    title: "Citation Check",
    blurb: "Citation error report.",
    spectrum: "Fidelity",
    oversight: "Low",
    output: "Citation error report",
    command: "/ars-citation-check",
    triggers: ["check citations", "verify references"],
    conversational: false,
    instructions: `Mode: academic-paper / citation-check. Audit the document's
citations: in-text/reference-list mismatches, malformed entries, missing DOIs,
and any reference that looks fabricated or unverifiable. Output a table of
issues with severity. Flag, don't silently "fix", suspicious references.`,
  },
  {
    id: "academic-paper:disclosure",
    skill: "academic-paper",
    mode: "disclosure",
    title: "AI Disclosure",
    blurb: "Venue-specific AI-usage statement.",
    spectrum: "Fidelity",
    oversight: "Low",
    output: "AI-usage disclosure statement",
    command: "/ars-disclosure",
    triggers: ["AI disclosure", "generate AI usage statement"],
    conversational: false,
    instructions: `Mode: academic-paper / disclosure. Ask which venue (ICLR,
NeurIPS, Nature, Science, ACL, EMNLP, or other) and what the user actually used
AI for, then draft an honest, venue-appropriate AI-usage disclosure statement.
Do not understate or overstate the AI's role.`,
  },

  // -------------------------------------------------------- academic-paper-reviewer
  {
    id: "academic-paper-reviewer:full",
    skill: "academic-paper-reviewer",
    mode: "full",
    title: "Peer Review",
    blurb: "5 review reports + editorial decision + revision roadmap.",
    spectrum: "Balanced",
    oversight: "High",
    output: "5 reviews + Editorial Decision + Revision Roadmap",
    command: "/ars-reviewer",
    triggers: ["review paper", "peer review", "manuscript review"],
    conversational: false,
    instructions: `Mode: academic-paper-reviewer / full. Review the manuscript from
multiple perspectives (e.g. methodology, novelty, clarity, related-work,
ethics). Produce per-perspective reviews, then an Editorial Decision
(accept / minor / major / reject with reasons) and a prioritized Revision
Roadmap. Be specific and fair; quote what you critique. You are simulating a
panel — note that this is one model's best effort, not five independent
reviewers.`,
  },
  {
    id: "academic-paper-reviewer:re-review",
    skill: "academic-paper-reviewer",
    mode: "re-review",
    title: "Re-Review",
    blurb: "Revision verification checklist + residual issues.",
    spectrum: "Fidelity",
    oversight: "Medium",
    output: "Verification checklist + residual issues",
    triggers: ["check revisions", "verification review"],
    conversational: false,
    instructions: `Mode: academic-paper-reviewer / re-review. Given the prior
review and the revised manuscript, verify each requested change was actually
made, and list residual or newly introduced issues. Output a checklist:
Addressed / Partially / Not addressed, with locations.`,
  },
  {
    id: "academic-paper-reviewer:quick",
    skill: "academic-paper-reviewer",
    mode: "quick",
    title: "Quick Review",
    blurb: "EIC quick assessment + key issues list.",
    spectrum: "Fidelity",
    oversight: "Low",
    output: "Quick assessment + key issues",
    triggers: ["quick review", "quick look"],
    conversational: false,
    instructions: `Mode: academic-paper-reviewer / quick. Give an
editor-in-chief-style snap assessment: overall recommendation, the 3–5 issues
that matter most, and whether it's worth a full review. Fast and decisive.`,
  },
  {
    id: "academic-paper-reviewer:methodology-focus",
    skill: "academic-paper-reviewer",
    mode: "methodology-focus",
    title: "Methodology Review",
    blurb: "In-depth methodology review.",
    spectrum: "Fidelity",
    oversight: "Medium",
    output: "In-depth methodology review",
    triggers: ["check methodology", "focus on methods"],
    conversational: false,
    instructions: `Mode: academic-paper-reviewer / methodology-focus. Scrutinize
design, sampling, measures, analysis, and threats to validity. Flag
confounds, underpowered designs, p-hacking risks, and mismatches between
question and method. Suggest concrete remedies.`,
  },
  {
    id: "academic-paper-reviewer:guided",
    skill: "academic-paper-reviewer",
    mode: "guided",
    title: "Guided Review (Socratic)",
    blurb: "Socratic issue-by-issue dialogue to improve the paper.",
    spectrum: "Originality",
    oversight: "Very High",
    output: "Socratic issue-by-issue dialogue",
    triggers: ["guide me to improve", "walk me through issues"],
    conversational: true,
    instructions: `Mode: academic-paper-reviewer / guided. DIALOGUE mode. Take the
paper's issues one at a time. For each, ask the author a question that helps
them see and fix it themselves rather than just handing them the fix. Teach
through the review.`,
  },
  {
    id: "academic-paper-reviewer:calibration",
    skill: "academic-paper-reviewer",
    mode: "calibration",
    title: "Reviewer Calibration",
    blurb: "Measure reviewer accuracy (FNR/FPR/AUC) on a gold set.",
    spectrum: "Fidelity",
    oversight: "Medium",
    output: "Calibration Report (FNR/FPR/AUC)",
    triggers: ["calibrate reviewer", "measure reviewer accuracy"],
    conversational: false,
    instructions: `Mode: academic-paper-reviewer / calibration. The user supplies a
gold set of known issues. Run the review, compare against the gold set, and
report false-negative rate, false-positive rate, and a confidence disclosure.
Be candid about the model's blind spots.`,
  },

  // ---------------------------------------------------------------- academic-pipeline
  {
    id: "academic-pipeline:pipeline",
    skill: "academic-pipeline",
    mode: "",
    title: "Full Pipeline",
    blurb: "Research → write → integrity → review → revise → finalize.",
    spectrum: "Balanced",
    oversight: "Very High",
    output: "10-stage orchestrated workflow",
    command: "/ars-full",
    triggers: ["academic pipeline", "research to paper", "full paper workflow"],
    conversational: true,
    instructions: `Mode: academic-pipeline (orchestrator). Run the end-to-end
workflow as a guided, checkpointed process: (1) clarify the research question,
(2) research, (3) integrity check, (4) draft, (5) review, (6) revise,
(7) final integrity check, (8) finalize. Stop at each stage boundary, summarize
what was produced, and get the user's go-ahead before proceeding. This is the
most human-in-the-loop mode — never run all stages silently.`,
  },
  {
    id: "academic-pipeline:resume",
    skill: "academic-pipeline",
    mode: "resume_from_passport",
    title: "Resume Pipeline",
    blurb: "Continue a prior pipeline run from a saved checkpoint.",
    spectrum: "Fidelity",
    oversight: "High",
    output: "Resumed pipeline from a reset boundary",
    triggers: ["resume from passport", "continue pipeline from reset boundary"],
    conversational: true,
    instructions: `Mode: academic-pipeline / resume_from_passport. The user is
resuming an earlier pipeline run. Ask them to paste the prior stage's summary
(the "Material Passport" ledger or wherever they left off), confirm what stage
they're at, then continue the checkpointed workflow from there. Do not redo
completed stages; pick up where they stopped.`,
  },
];

export const MODES: Mode[] = RAW.map(({ instructions, ...m }) => m);

const INSTRUCTIONS = new Map(RAW.map((m) => [m.id, m.instructions]));
const MODE_BY_ID = new Map(RAW.map((m) => [m.id, m as Mode]));

export function getMode(id: string): Mode | undefined {
  return MODE_BY_ID.get(id);
}

/** Full system prompt for a mode id, or undefined if unknown. */
export function systemPromptFor(id: string): string | undefined {
  const instr = INSTRUCTIONS.get(id);
  if (instr === undefined) return undefined;
  return buildSystemPrompt(instr);
}

export const SKILLS: { id: string; title: string }[] = [
  { id: "deep-research", title: "Deep Research" },
  { id: "academic-paper", title: "Academic Paper" },
  { id: "academic-paper-reviewer", title: "Paper Reviewer" },
  { id: "academic-pipeline", title: "Full Pipeline" },
];
