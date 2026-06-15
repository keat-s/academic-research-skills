import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api";
import { authClient } from "../lib/auth-client";
import { useAuth } from "../auth";
import { loadSettings, saveSettings } from "../settings";
import { WEBLLM_MODELS, isWebGpuAvailable } from "../webllm";
import type { ModelInfo } from "@ars/core";

interface Sub {
  plan: string;
  status: string;
  cancelAtPeriodEnd?: boolean;
}

export function Settings() {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState(loadSettings());
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [localAvailable, setLocalAvailable] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resent, setResent] = useState(false);
  const [supporterEnabled, setSupporterEnabled] = useState(false);
  const [subscription, setSubscription] = useState<Sub | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const webgpu = isWebGpuAvailable();

  useEffect(() => {
    api.models().then((r) => setModels(r.models)).catch(() => {});
    api
      .localModels()
      .then((r) => {
        setLocalModels(r.models);
        setLocalAvailable(r.available);
      })
      .catch(() => {});
    // Supporter tier is config-gated server-side (Stripe). Only show the card
    // when the server advertises it, and reflect any existing subscription.
    api
      .health()
      .then((h) => {
        const enabled = !!(h as { features?: { supporter?: boolean } }).features?.supporter;
        setSupporterEnabled(enabled);
        if (enabled) refreshSubscription();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshSubscription() {
    try {
      const { data } = await authClient.subscription.list();
      const active = (data ?? []).find(
        (s: Sub) => s.status === "active" || s.status === "trialing"
      );
      setSubscription(active ?? null);
    } catch {
      setSubscription(null);
    }
  }

  async function becomeSupporter() {
    setBillingBusy(true);
    try {
      await authClient.subscription.upgrade({
        plan: "supporter",
        successUrl: `${window.location.origin}/settings?supporter=success`,
        cancelUrl: `${window.location.origin}/settings`,
      });
    } finally {
      setBillingBusy(false);
    }
  }

  async function cancelSupporter() {
    setBillingBusy(true);
    try {
      await authClient.subscription.cancel({ returnUrl: `${window.location.origin}/settings` });
    } finally {
      setBillingBusy(false);
    }
  }

  function update(patch: Partial<typeof settings>) {
    const next = saveSettings(patch);
    setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function resend() {
    if (user?.email) {
      await authClient
        .sendVerificationEmail({ email: user.email, callbackURL: `${window.location.origin}/app` })
        .catch(() => {});
    }
    setResent(true);
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <Link
        to="/app"
        className="inline-flex items-center gap-1.5 text-sm hover:underline"
        style={{ color: "var(--text-link)" }}
      >
        <ArrowLeft size={14} strokeWidth={1.75} />
        Back to studio
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-foreground">Settings</h1>

      <section className="card mt-6">
        <p
          className="text-xs font-mono uppercase tracking-[0.08em]"
          style={{ color: "var(--text-subtle)" }}
        >
          Signed in as
        </p>
        <div className="mt-0.5 text-foreground">{user?.email}</div>
        {user && user.emailVerified === false && (
          <div className="mt-2 text-sm" style={{ color: "var(--warning)" }}>
            Email not verified.{" "}
            {resent ? (
              <span style={{ color: "var(--success)" }}>Verification sent.</span>
            ) : (
              <button className="underline" onClick={resend}>
                Resend verification
              </button>
            )}
          </div>
        )}
        <button className="btn-ghost mt-3" onClick={logout}>
          Log out
        </button>
      </section>

      {supporterEnabled && (
        <section className="card mt-4 space-y-3">
          <h2 className="font-semibold text-foreground">Supporter</h2>
          <p className="text-sm text-muted-foreground">
            ARS Studio is free and open under CC BY-NC — and stays that way. Becoming a supporter is
            entirely optional: it never unlocks a core feature. It only raises your daily free
            message limit and adds a small thank-you badge. You can stop any time.
          </p>
          {subscription ? (
            <div className="space-y-2">
              <p className="text-sm" style={{ color: "var(--success)" }}>
                You're a supporter — thank you.{" "}
                {subscription.cancelAtPeriodEnd && (
                  <span style={{ color: "var(--warning)" }}>(ends at the period's close)</span>
                )}
              </p>
              <button className="btn-ghost" onClick={cancelSupporter} disabled={billingBusy}>
                {billingBusy ? "…" : "Manage or cancel"}
              </button>
            </div>
          ) : (
            <button className="btn-primary" onClick={becomeSupporter} disabled={billingBusy}>
              {billingBusy ? "…" : "Become a supporter"}
            </button>
          )}
        </section>
      )}

      <section className="card mt-4 space-y-3">
        <h2 className="font-semibold text-foreground">Inference backend</h2>
        <div className="grid grid-cols-3 gap-2">
          <button
            className={settings.provider === "openrouter" ? "btn-primary" : "btn-ghost"}
            onClick={() => update({ provider: "openrouter" })}
          >
            Cloud
          </button>
          <button
            className={settings.provider === "webllm" ? "btn-primary" : "btn-ghost"}
            onClick={() => update({ provider: "webllm" })}
            disabled={!webgpu}
            title={webgpu ? "" : "Needs a WebGPU-capable browser"}
          >
            In-browser{webgpu ? "" : " — n/a"}
          </button>
          <button
            className={settings.provider === "ollama" ? "btn-primary" : "btn-ghost"}
            onClick={() => update({ provider: "ollama" })}
            disabled={!localAvailable}
            title={localAvailable ? "" : "Start Ollama locally to enable"}
          >
            Ollama{localAvailable ? "" : " — off"}
          </button>
        </div>

        {settings.provider === "openrouter" && (
          <>
            <select className="input" value={settings.model} onChange={(e) => update({ model: e.target.value })}>
              <option value="">Server default (free)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.free ? "" : " (paid — needs your key)"}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Free open models, proxied through the server.</p>
          </>
        )}

        {settings.provider === "webllm" && (
          <>
            <select
              className="input"
              value={settings.webllmModel}
              onChange={(e) => update({ webllmModel: e.target.value })}
            >
              <option value="">Choose a model to download…</option>
              {WEBLLM_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — ~{Math.round(m.sizeMB)} MB
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Runs entirely in your browser via WebGPU — fully private, no key, no limit. The model
              downloads once on first use (cached afterward); larger models need more GPU memory.
            </p>
          </>
        )}

        {settings.provider === "ollama" && (
          <>
            <select
              className="input"
              value={settings.localModel}
              onChange={(e) => update({ localModel: e.target.value })}
            >
              <option value="">Choose a local model…</option>
              {localModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Runs on your machine via Ollama — private, no key, no daily limit.
            </p>
          </>
        )}
      </section>

      <section className="card mt-4 space-y-2">
        <label className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-foreground">Citation grounding by default</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              Retrieve real sources (Crossref / OpenAlex / Semantic Scholar) before answering.
            </div>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={settings.grounding}
            onChange={(e) => update({ grounding: e.target.checked })}
          />
        </label>
      </section>

      <section className="card mt-4 space-y-3">
        <h2 className="font-semibold text-foreground">Bring your own key (optional)</h2>
        <p className="text-sm text-muted-foreground">
          Paste an{" "}
          <a
            style={{ color: "var(--text-link)" }}
            className="hover:underline"
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
          >
            OpenRouter API key
          </a>{" "}
          to skip the daily free limit and unlock paid models. Stored only in this browser; sent
          straight to OpenRouter, never saved on our server.
        </p>
        <input
          className="input"
          type="password"
          placeholder="sk-or-..."
          value={settings.apiKey}
          onChange={(e) => update({ apiKey: e.target.value })}
        />
        {settings.apiKey && (
          <button className="btn-ghost" onClick={() => update({ apiKey: "" })}>
            Remove key
          </button>
        )}
      </section>

      {saved && (
        <p className="mt-3 text-sm" style={{ color: "var(--success)" }}>
          Saved.
        </p>
      )}
    </div>
  );
}
