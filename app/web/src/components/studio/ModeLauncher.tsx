import { useMemo, useState } from "react";
import { BookOpen, Compass } from "lucide-react";
import type { Mode } from "@ars/core";
import { Badge } from "@/components/ui/badge";
import { SKILL_META, SKILL_ORDER } from "./skillMeta.js";

export function ModeLauncher({
  modes,
  onPick,
  userName,
}: {
  modes: Mode[];
  onPick: (m: Mode) => void;
  userName: string | null;
}) {
  const [q, setQ] = useState("");
  const [activeSkill, setActiveSkill] = useState<string | null>(null);

  // Mode counts per skill (for the capability cards), computed from live data.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of modes) c[m.skill] = (c[m.skill] ?? 0) + 1;
    return c;
  }, [modes]);

  const searching = q.trim().length > 0;

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return modes.filter((m) => {
      if (activeSkill && m.skill !== activeSkill) return false;
      if (!searching) return true;
      return (
        m.title.toLowerCase().includes(ql) ||
        m.blurb.toLowerCase().includes(ql) ||
        m.triggers.some((t) => t.toLowerCase().includes(ql))
      );
    });
  }, [modes, q, activeSkill, searching]);

  // Group filtered modes by skill in the canonical pipeline order.
  const grouped = useMemo(() => {
    const groups: Record<string, Mode[]> = {};
    for (const m of filtered) (groups[m.skill] ??= []).push(m);
    return SKILL_ORDER.filter((s) => groups[s]?.length).map((s) => [s, groups[s]!] as const);
  }, [filtered]);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-6 animate-fade-up">
      <h1 className="text-2xl font-bold text-foreground">
        {userName ? `Hi ${userName} — what are you working on?` : "What are you working on?"}
      </h1>
      <p className="mt-1 text-muted-foreground">
        {modes.length} workflows across four research skills — from a single question to a finished,
        peer-reviewed paper.
      </p>

      {/* Recommended pipeline flow — communicates the end-to-end journey at a glance. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-subtle)]">Typical flow</span>
        {SKILL_ORDER.slice(0, 3).map((s, i) => {
          const meta = SKILL_META[s];
          return (
            <span key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-[color:var(--border-default)]">→</span>}
              <button
                onClick={() => {
                  setActiveSkill(s);
                  setQ("");
                }}
                className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-muted-foreground transition-colors hover:border-[color:var(--border-strong)] hover:bg-muted"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: meta?.dotVar }}
                />
                {meta?.label}
              </button>
            </span>
          );
        })}
        <span className="text-[color:var(--border-default)]">→</span>
        <button
          onClick={() => {
            setActiveSkill("academic-pipeline");
            setQ("");
          }}
          className="chip flex items-center gap-1.5"
        >
          <Compass size={13} strokeWidth={2} />
          or run the whole pipeline
        </button>
      </div>

      {/* Capability cards — what each skill does; double as filters. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SKILL_ORDER.map((skill) => {
          const meta = SKILL_META[skill];
          if (!meta) return null;
          const active = activeSkill === skill;
          const { Icon } = meta;
          return (
            <button
              key={skill}
              onClick={() => {
                setActiveSkill(active ? null : skill);
                setQ("");
              }}
              className={`rounded-2xl border p-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 ${
                active
                  ? "border-[color:var(--border-accent)] bg-accent/30 ring-1 ring-inset ring-[color:var(--border-accent)]"
                  : "border-border bg-card hover:border-[color:var(--border-strong)]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `color-mix(in srgb, ${meta.dotVar} 12%, transparent)` }}
                >
                  <Icon size={15} strokeWidth={2} style={{ color: meta.dotVar }} />
                </span>
                <span className="font-semibold text-foreground">{meta.label}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{meta.desc}</p>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-subtle)]">
                {counts[skill] ?? 0} {counts[skill] === 1 ? "mode" : "modes"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-2">
        <input
          className="input"
          placeholder="Search modes… (e.g. lit review, peer review, abstract)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {(activeSkill || searching) && (
          <button
            className="btn-ghost shrink-0 whitespace-nowrap px-3 py-2 text-xs"
            onClick={() => {
              setActiveSkill(null);
              setQ("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-6 space-y-8 pb-8">
        {grouped.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No modes match "{q}".{" "}
            <button className="underline" onClick={() => setQ("")}>
              Clear search
            </button>
            .
          </p>
        )}
        {grouped.map(([skill, list]) => {
          const meta = SKILL_META[skill];
          const { Icon } = meta ?? { Icon: BookOpen };
          return (
            <section key={skill}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon size={15} strokeWidth={2} style={{ color: meta?.dotVar }} />
                {meta?.label ?? skill}
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-subtle)]">
                  · {list.length} modes
                </span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onPick(m)}
                    className="card group/mode text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-[color:var(--border-accent)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{m.title}</span>
                      {m.conversational && (
                        <Badge variant="outline" className="chip">
                          dialogue
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{m.blurb}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-[0.06em] font-normal">
                        {m.output}
                      </Badge>
                      <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-[0.06em] font-normal">
                        {m.oversight} oversight
                      </Badge>
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-subtle)]">
                        {m.spectrum}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
