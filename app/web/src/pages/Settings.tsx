import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { loadSettings, saveSettings } from "../settings";
import type { ModelInfo } from "@ars/core";

export function Settings() {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState(loadSettings());
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.models().then((r) => setModels(r.models)).catch(() => {});
  }, []);

  function update(patch: Partial<typeof settings>) {
    const next = saveSettings(patch);
    setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
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
        <button className="btn-ghost mt-3" onClick={logout}>
          Log out
        </button>
      </section>

      <section className="card mt-4 space-y-3">
        <h2 className="font-semibold text-slate-200">AI model</h2>
        <select
          className="input"
          value={settings.model}
          onChange={(e) => update({ model: e.target.value })}
        >
          <option value="">Server default (free)</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.free ? "" : " (paid — needs your key)"}
            </option>
          ))}
        </select>
      </section>

      <section className="card mt-4 space-y-3">
        <h2 className="font-semibold text-slate-200">Bring your own key (optional)</h2>
        <p className="text-sm text-slate-400">
          Paste an{" "}
          <a className="text-indigo-300 hover:underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
            OpenRouter API key
          </a>{" "}
          to skip the daily free limit and unlock paid models. It's stored only in this browser and
          sent straight to OpenRouter — never saved on our server.
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
