import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { loadSettings, saveSettings } from "../settings";
import { WEBLLM_MODELS, isWebGpuAvailable } from "../webllm";
import type { ModelInfo } from "@ars/core";

export function Settings() {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState(loadSettings());
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [localAvailable, setLocalAvailable] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resent, setResent] = useState(false);
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
  }, []);

  function update(patch: Partial<typeof settings>) {
    const next = saveSettings(patch);
    setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function resend() {
    await api.resendVerification().catch(() => {});
    setResent(true);
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <Link to="/app" className="text-sm text-indigo-300 hover:underline">
        ← Back to studio
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-white">Settings</h1>

      <section className="card mt-6">
        <div className="text-sm text-slate-400">Signed in as</div>
        <div className="text-slate-100">{user?.email}</div>
        {user && user.emailVerified === false && (
          <div className="mt-2 text-sm text-amber-300">
            Email not verified.{" "}
            {resent ? (
              <span className="text-emerald-400">Verification sent.</span>
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

      <section className="card mt-4 space-y-3">
        <h2 className="font-semibold text-slate-200">Inference backend</h2>
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
            <p className="text-xs text-slate-500">Free open models, proxied through the server.</p>
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
            <p className="text-xs text-slate-500">
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
            <p className="text-xs text-slate-500">
              Runs on your machine via Ollama — private, no key, no daily limit.
            </p>
          </>
        )}
      </section>

      <section className="card mt-4 space-y-2">
        <label className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-200">Citation grounding by default</div>
            <div className="text-sm text-slate-400">
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
        <h2 className="font-semibold text-slate-200">Bring your own key (optional)</h2>
        <p className="text-sm text-slate-400">
          Paste an{" "}
          <a className="text-indigo-300 hover:underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
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

      {saved && <p className="mt-3 text-sm text-emerald-400">Saved.</p>}
    </div>
  );
}
