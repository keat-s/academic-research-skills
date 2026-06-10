import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type MonetizationConfig } from "../api";

interface TipsConfig {
  enabled: boolean;
  stripe: boolean;
  presets: number[];
  currency: string;
  paymentLink: string | null;
}

function TipJar({ tips }: { tips: TipsConfig }) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout(amountCents: number) {
    setError("");
    setBusy(true);
    try {
      const { url } = await api.tipCheckout(amountCents);
      window.location.href = url;
    } catch {
      setError("Couldn't start checkout — try again in a moment.");
      setBusy(false);
    }
  }

  const symbol = tips.currency === "usd" ? "$" : tips.currency.toUpperCase() + " ";

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        A tip buys nothing — no features unlock, no limits change. It just helps keep the free
        models and servers running.
      </p>
      {tips.stripe ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {tips.presets.map((cents) => (
              <button
                key={cents}
                className="btn-ghost"
                disabled={busy}
                onClick={() => checkout(cents)}
              >
                {symbol}
                {(cents / 100).toFixed(0)}
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <input
                className="input w-24"
                placeholder={`${symbol}custom`}
                inputMode="decimal"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
              <button
                className="btn-primary"
                disabled={busy || !Number(custom)}
                onClick={() => checkout(Math.round(Number(custom) * 100))}
              >
                Tip
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <p className="text-[11px] text-slate-600">Secure checkout via Stripe. No account data shared.</p>
        </>
      ) : (
        tips.paymentLink && (
          <a className="btn-primary" href={tips.paymentLink} target="_blank" rel="noreferrer">
            Leave a tip
          </a>
        )
      )}
    </div>
  );
}

export function Support() {
  const [cfg, setCfg] = useState<MonetizationConfig | null>(null);
  const [tips, setTips] = useState<TipsConfig | null>(null);
  const [params] = useSearchParams();
  const tipState = params.get("tip");

  useEffect(() => {
    api.monetization().then(setCfg).catch(() => {});
    api.tipsConfig().then(setTips).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 animate-fade-up">
      <Link to="/app" className="text-sm text-indigo-300 hover:underline">
        ← Back to studio
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-white">Support ARS Studio</h1>
      <p className="mt-2 text-slate-400">
        The app and its AI features are free, and always will be. The content this is built on is
        licensed CC BY-NC 4.0 — so there are no paid tiers or feature paywalls. If it saves you
        time, here are voluntary ways to keep it running.
      </p>

      {tipState === "success" && (
        <div className="card mt-5 border-emerald-400/40 text-emerald-300">
          💚 Thank you! Your tip keeps this free for everyone.
        </div>
      )}
      {tipState === "cancelled" && (
        <div className="card mt-5 text-slate-400">No worries — the app stays free either way.</div>
      )}

      {!cfg && <p className="mt-6 text-slate-500">Loading…</p>}

      {cfg && (
        <div className="mt-8 space-y-6">
          {tips?.enabled && (
            <Section title="💜 Leave a tip">
              <TipJar tips={tips} />
            </Section>
          )}

          {cfg.donations.length > 0 && (
            <Section title="☕ Donate">
              <div className="flex flex-wrap gap-2">
                {cfg.donations.map((d) => (
                  <a key={d.label} className="btn-primary" href={d.url} target="_blank" rel="noreferrer">
                    {d.label}
                  </a>
                ))}
              </div>
            </Section>
          )}

          {cfg.sponsorTiers.length > 0 && (
            <Section title="💛 Sponsor">
              <div className="grid gap-3 sm:grid-cols-2">
                {cfg.sponsorTiers.map((s) => (
                  <a key={s.name} className="card hover:border-indigo-400" href={s.url} target="_blank" rel="noreferrer">
                    <div className="font-semibold text-slate-100">{s.name}</div>
                    <div className="text-sm text-slate-400">{s.blurb}</div>
                  </a>
                ))}
              </div>
            </Section>
          )}

          <Section title="🔑 Bring your own key">
            <p className="text-sm text-slate-400">
              Add your own OpenRouter key to skip the daily free limit and pick premium models. You
              pay your provider directly — nothing flows through us.
            </p>
            <Link to="/settings" className="btn-ghost mt-3">
              Open settings
            </Link>
          </Section>

          {cfg.affiliates.length > 0 && (
            <Section title="🔗 Tools we like">
              <ul className="space-y-2">
                {cfg.affiliates.map((a) => (
                  <li key={a.label} className="text-sm">
                    <a className="text-indigo-300 hover:underline" href={a.url} target="_blank" rel="noreferrer">
                      {a.label}
                    </a>
                    <span className="ml-2 text-slate-500">{a.note}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {cfg.grants.length > 0 && (
            <Section title="🏛️ Institutional & grant funding">
              {cfg.grants.map((g) => (
                <a key={g.label} className="text-indigo-300 hover:underline" href={g.url} target="_blank" rel="noreferrer">
                  {g.label}
                </a>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-semibold text-slate-200">{title}</h2>
      {children}
    </section>
  );
}
