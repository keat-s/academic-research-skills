import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import type { Mode, SkillId } from "@ars/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ActionItem {
  title: string;
  prompt: string;
}

const SKILL_ACTIONS: Record<SkillId, ActionItem[]> = {
  "deep-research": [
    {
      title: "State of the art",
      prompt: "Summarize the state of the art on [your topic] — cover key findings, open questions, and leading approaches.",
    },
    {
      title: "Compare key papers",
      prompt: "Find and compare key papers on [your topic] — highlight methodological differences and conflicting findings.",
    },
    {
      title: "Literature gaps",
      prompt: "Identify the main gaps in the literature on [your topic] and suggest where future research is most needed.",
    },
    {
      title: "Evidence synthesis",
      prompt: "Synthesize the empirical evidence on [your topic] — rank findings by evidence quality and note contradictions.",
    },
  ],
  "academic-paper": [
    {
      title: "Draft an abstract",
      prompt: "Draft an abstract for a paper titled '[your title]' — include background, objective, methods, results, and conclusion.",
    },
    {
      title: "Outline a paper",
      prompt: "Outline a paper arguing [your thesis] — propose section headings, key claims per section, and a logical flow.",
    },
    {
      title: "Introduction paragraph",
      prompt: "Write an introduction for a paper on [your topic] that motivates the research question and states the contribution clearly.",
    },
    {
      title: "Discussion section",
      prompt: "Help me write the discussion section — I'll paste my results and you interpret them in light of prior literature.",
    },
  ],
  "academic-paper-reviewer": [
    {
      title: "Methodological review",
      prompt: "Review this draft for methodological rigor — check study design, sample, measures, and analysis choices.",
    },
    {
      title: "Citation check",
      prompt: "Check these claims for citation support — flag any unsupported assertions or references that seem misrepresented.",
    },
    {
      title: "Clarity and structure",
      prompt: "Review this draft for clarity and logical structure — flag any passages that are confusing or sections that seem out of order.",
    },
    {
      title: "Contribution framing",
      prompt: "Assess whether the paper's contribution is clearly framed and differentiated from prior work.",
    },
  ],
  "academic-pipeline": [
    {
      title: "Research to draft",
      prompt: "Take my topic from research to draft — run a full literature review, synthesize findings, then produce a paper outline.",
    },
    {
      title: "Full literature review then outline",
      prompt: "Run a full literature review on [your topic] and then outline a paper based on what the evidence supports.",
    },
    {
      title: "End-to-end pipeline",
      prompt: "Run the full academic pipeline on [your topic]: research → paper draft → integrity check → peer review.",
    },
    {
      title: "Research question to submission",
      prompt: "Starting from my research question, guide me through every stage: literature review, paper writing, review, and revision.",
    },
  ],
};

const GENERIC_ACTIONS: ActionItem[] = [
  {
    title: "Start researching",
    prompt: "Help me research [your topic] — gather key sources, synthesize findings, and identify important themes.",
  },
  {
    title: "Write a draft",
    prompt: "Help me write an academic draft on [your topic] — include a clear argument, supporting evidence, and citations.",
  },
  {
    title: "Review my work",
    prompt: "Review my writing for academic rigor — check claims, evidence, clarity, and logical structure.",
  },
  {
    title: "Run the full pipeline",
    prompt: "Take my topic through the full academic pipeline: research, writing, review, and revision.",
  },
];

export function SuggestedActions({ mode, onPick }: { mode: Mode; onPick: (text: string) => void }) {
  const actions = SKILL_ACTIONS[mode.skill] ?? GENERIC_ACTIONS;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {actions.map((action) => (
        <Button
          key={action.title}
          variant="outline"
          className={cn(
            "h-auto justify-start text-left whitespace-normal p-4 flex-col items-start gap-1",
            "relative"
          )}
          onClick={() => onPick(action.prompt)}
        >
          <span className="font-semibold text-sm leading-snug pr-6">{action.title}</span>
          <span className="text-xs text-muted-foreground leading-snug">{action.prompt}</span>
          <ArrowUpRight className="absolute top-3 right-3 h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      ))}
    </div>
  );
}
