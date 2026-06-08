import { Link } from "react-router-dom";

export function Landing() {
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 text-5xl">🎓</div>
      <h1 className="text-4xl font-bold text-white">ARS Studio</h1>
      <p className="mt-3 max-w-xl text-lg text-slate-300">
        AI-native academic research, writing, and peer review. Free to use, on web, mobile, and
        desktop — built on the open Academic Research Skills suite.
      </p>
      <ul className="mt-6 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
        <li className="card text-left">📚 Deep research & literature reviews</li>
        <li className="card text-left">✍️ Paper drafting, outlining & revision</li>
        <li className="card text-left">🔍 Multi-perspective peer review</li>
        <li className="card text-left">🧭 Socratic planning dialogues</li>
      </ul>
      <p className="mt-6 max-w-xl text-sm text-slate-400">
        AI runs on free open models (via OpenRouter), or bring your own key. No subscriptions —
        ever. Support is voluntary.
      </p>
      <div className="mt-8 flex gap-3">
        <Link to="/login" className="btn-primary">
          Get started — it's free
        </Link>
        <a
          className="btn-ghost"
          href="https://github.com/Imbad0202/academic-research-skills"
          target="_blank"
          rel="noreferrer"
        >
          View the skills
        </a>
      </div>
      <p className="mt-10 text-xs text-slate-600">
        AI is your copilot, not the pilot. Verify every citation. CC BY-NC 4.0.
      </p>
    </div>
  );
}
