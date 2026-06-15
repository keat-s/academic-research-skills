import { Link } from "react-router-dom";
import { BookOpen, PenLine, Users, Compass, Link2, Shield } from "lucide-react";
import scioMark from "../scio/assets/scio-mark.svg";
import scioWordmark from "../scio/assets/scio-wordmark.svg";

const FEATURES = [
  {
    Icon: BookOpen,
    title: "Deep research",
    body: "Multi-source research reports, literature reviews, fact-checks, and PRISMA systematic reviews.",
  },
  {
    Icon: PenLine,
    title: "Paper writing",
    body: "Drafting, outlining, revision with point-by-point R&R responses, and bilingual abstracts.",
  },
  {
    Icon: Users,
    title: "Peer review",
    body: "Multi-perspective review reports, editorial decisions, and a Socratic guided-review mode.",
  },
  {
    Icon: Compass,
    title: "Socratic planning",
    body: "Guided dialogues that sharpen your research question instead of answering it for you.",
  },
  {
    Icon: Link2,
    title: "Real citations",
    body: "Citation grounding retrieves live sources from Crossref, OpenAlex, and Semantic Scholar — real DOIs, not hallucinations.",
  },
  {
    Icon: Shield,
    title: "Private by choice",
    body: "Run on free cloud models, your own key, or fully on-device with WebGPU or Ollama.",
  },
];

const STEPS = [
  { n: "1", title: "Pick a workflow", body: "25 modes across research, writing, review, and the full pipeline." },
  { n: "2", title: "Bring your material", body: "Attach PDFs, paste drafts, or just describe the task." },
  { n: "3", title: "Stay the pilot", body: "The AI does the grunt work; you make the calls. Export anywhere." },
];

export function Landing() {
  return (
    <div className="min-h-full bg-background">
      {/* Nav */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <img src={scioMark} alt="Scio mark" className="h-8 w-8" />
          <img src={scioWordmark} alt="Scio" className="h-5" />
        </div>
        <nav className="flex items-center gap-2">
          <a
            className="btn-ghost hidden sm:inline-flex"
            href="https://github.com/Imbad0202/academic-research-skills"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <Link to="/login" className="btn-primary">
            Sign in
          </Link>
        </nav>
      </header>

      {/* Hero — inverse ink panel with dotted grid and serif pull-quote */}
      <section
        className="scio-dotgrid-invert mx-4 mb-10 rounded-2xl px-6 pb-16 pt-16 text-center animate-fade-up sm:mx-8"
        style={{ background: "var(--surface-inverse)" }}
      >
        <span className="chip">
          Free forever · no subscriptions
        </span>
        <h1
          className="mt-6 text-4xl font-extrabold leading-tight text-white sm:text-5xl"
          style={{ letterSpacing: "var(--tracking-snug)" }}
        >
          Your research, grounded.
        </h1>
        <p
          className="mx-auto mt-4 max-w-xl text-lg leading-relaxed font-serif italic"
          style={{ color: "var(--teal-200)" }}
        >
          "The tools of scholarship should sharpen thought, not replace it."
        </p>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed" style={{ color: "var(--n-300)" }}>
          Research, write, and review papers with 25 rigorous workflows — grounded in real
          citations, on web, mobile, and desktop.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/login" className="btn-primary px-6 py-3 text-base">
            Get started — it's free
          </Link>
          <a
            className="btn-ghost px-6 py-3 text-base"
            style={{ background: "transparent", borderColor: "var(--n-600)", color: "var(--n-200)" }}
            href="https://github.com/Imbad0202/academic-research-skills"
            target="_blank"
            rel="noreferrer"
          >
            View the skills behind it
          </a>
        </div>
        <p className="mt-6 text-sm" style={{ color: "var(--n-500)" }}>
          AI features run on free open models, your own key, or fully on-device.
        </p>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <p
          className="mb-8 text-center text-xs font-mono uppercase tracking-[0.08em]"
          style={{ color: "var(--text-subtle)" }}
        >
          What it does
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="card animate-fade-up transition-transform duration-200 hover:-translate-y-0.5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <f.Icon size={20} strokeWidth={1.5} style={{ color: "var(--accent)" }} />
              <h3 className="mt-2.5 font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-6 pb-16">
        <p
          className="mb-8 text-center text-xs font-mono uppercase tracking-[0.08em]"
          style={{ color: "var(--text-subtle)" }}
        >
          How it works
        </p>
        <h2 className="mb-7 text-center text-2xl font-bold text-foreground">Three steps, one workflow</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card text-center">
              <div
                className="mx-auto grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white"
                style={{ background: "var(--accent)" }}
              >
                {s.n}
              </div>
              <h3 className="mt-3 font-semibold text-foreground">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        className="border-t py-8 text-center text-xs leading-relaxed"
        style={{ color: "var(--text-subtle)", borderColor: "var(--border-default)" }}
      >
        <p>AI is your copilot, not the pilot. Verify every citation before use.</p>
        <p className="mt-1">
          Built on the Academic Research Skills suite · CC BY-NC 4.0 · Support is voluntary
        </p>
      </footer>
    </div>
  );
}
