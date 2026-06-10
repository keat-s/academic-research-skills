import { Link } from "react-router-dom";

const FEATURES = [
  {
    icon: "📚",
    title: "Deep research",
    body: "Multi-source research reports, literature reviews, fact-checks, and PRISMA systematic reviews.",
  },
  {
    icon: "✍️",
    title: "Paper writing",
    body: "Drafting, outlining, revision with point-by-point R&R responses, and bilingual abstracts.",
  },
  {
    icon: "🔍",
    title: "Peer review",
    body: "Multi-perspective review reports, editorial decisions, and a Socratic guided-review mode.",
  },
  {
    icon: "🧭",
    title: "Socratic planning",
    body: "Guided dialogues that sharpen your research question instead of answering it for you.",
  },
  {
    icon: "🔗",
    title: "Real citations",
    body: "Citation grounding retrieves live sources from Crossref, OpenAlex, and Semantic Scholar — real DOIs, not hallucinations.",
  },
  {
    icon: "🔒",
    title: "Private by choice",
    body: "Run on free cloud models, your own key, or fully on-device with WebGPU / Ollama.",
  },
];

const STEPS = [
  { n: "1", title: "Pick a workflow", body: "25 modes across research, writing, review, and the full pipeline." },
  { n: "2", title: "Bring your material", body: "Attach PDFs, paste drafts, or just describe the task." },
  { n: "3", title: "Stay the pilot", body: "The AI does the grunt work; you make the calls. Export anywhere." },
];

export function Landing() {
  return (
    <div className="min-h-full">
      {/* Nav */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-lg font-bold text-white">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 font-serif text-base shadow-lg shadow-indigo-500/30">
            A
          </span>
          ARS Studio
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

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pb-14 pt-16 text-center animate-fade-up">
        <p className="chip border border-indigo-400/30 bg-indigo-400/10 text-indigo-300">
          Free forever · no subscriptions
        </p>
        <h1 className="mt-5 text-4xl font-extrabold leading-tight text-white sm:text-5xl">
          Your AI copilot for{" "}
          <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-indigo-300 bg-clip-text text-transparent">
            academic work
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
          Research, write, and review papers with 25 rigorous workflows — grounded in real
          citations, on web, mobile, and desktop.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/login" className="btn-primary px-6 py-3 text-base">
            Get started — it's free
          </Link>
          <a
            className="btn-ghost px-6 py-3 text-base"
            href="https://github.com/Imbad0202/academic-research-skills"
            target="_blank"
            rel="noreferrer"
          >
            View the skills behind it
          </a>
        </div>
        <p className="mt-6 text-sm text-slate-500">
          AI features run on free open models, your own key, or fully on-device.
        </p>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="card animate-fade-up transition-transform duration-200 hover:-translate-y-0.5 hover:border-indigo-400/30"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-2.5 font-semibold text-slate-100">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-6 pb-16">
        <h2 className="text-center text-2xl font-bold text-white">How it works</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card text-center">
              <div className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">
                {s.n}
              </div>
              <h3 className="mt-3 font-semibold text-slate-100">{s.title}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 text-center text-xs leading-relaxed text-slate-600">
        <p>AI is your copilot, not the pilot. Verify every citation before use.</p>
        <p className="mt-1">
          Built on the Academic Research Skills suite · CC BY-NC 4.0 · Support is voluntary
        </p>
      </footer>
    </div>
  );
}
