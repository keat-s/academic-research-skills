// Skill display metadata shared by ModeLauncher and ChatView.
// Kept here (not in @ars/core) because it references Lucide icon components
// which are a web-only dependency.

import {
  BookOpen,
  PenLine,
  Search,
  Compass,
  type LucideProps,
} from "lucide-react";

type SkillIconComponent = React.ComponentType<LucideProps>;

export interface SkillMeta {
  label: string;
  Icon: SkillIconComponent;
  /** One-line "what this skill does" — drives the capability cards. */
  desc: string;
  /** Dot color var for the capability card + flow strip. */
  dotVar: string;
  /** Display order (also the recommended pipeline order). */
  order: number;
}

export const SKILL_META: Record<string, SkillMeta> = {
  "deep-research": {
    label: "Deep research",
    Icon: BookOpen,
    desc: "Investigate a question end-to-end — multi-agent search, fact-checking, and literature reviews.",
    dotVar: "var(--teal-500)",
    order: 0,
  },
  "academic-paper": {
    label: "Academic paper",
    Icon: PenLine,
    desc: "Turn research into a publication — outline, draft, revise, and bilingual abstracts.",
    dotVar: "var(--blue-500)",
    order: 1,
  },
  "academic-paper-reviewer": {
    label: "Paper reviewer",
    Icon: Search,
    desc: "Multi-perspective peer review — five reviewers plus a decision letter and revision roadmap.",
    dotVar: "var(--ochre-500)",
    order: 2,
  },
  "academic-pipeline": {
    label: "Full pipeline",
    Icon: Compass,
    desc: "The whole journey orchestrated — research → write → integrity → review → finalize.",
    dotVar: "var(--green-500)",
    order: 3,
  },
};

export const SKILL_ORDER = Object.entries(SKILL_META)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([id]) => id);
