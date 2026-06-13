import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError, api } from "../api";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
const PROVIDER_LABELS: Record<string, string> = { google: "Google", github: "GitHub" };

const ERROR_COPY: Record<string, string> = {
  invalid_email: "That doesn't look like a valid email.",
  password_too_short: "Password must be at least 8 characters.",
  email_taken: "An account with that email already exists.",
  invalid_credentials: "Email or password is incorrect.",
};

export function AuthPage() {
  const { login, signup } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    api.oauthProviders().then(setProviders).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        await api.requestReset(email);
        setNotice("If that email has an account, a reset link is on its way.");
      } else {
        if (mode === "signup") await signup(email, password, name || undefined);
        else await login(email, password);
        nav("/app", { replace: true });
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "error";
      setError(ERROR_COPY[code] ?? "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "login" ? "Welcome back" : mode === "signup" ? "Create your free account" : "Reset your password";

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="mt-1 text-sm text-slate-400">No subscription. AI features are free.</p>

      {providers.length > 0 && mode !== "forgot" && (
        <div className="mt-6 space-y-2">
          {providers.map((p) => (
            <a key={p} className="btn-ghost w-full" href={`${API_BASE}/auth/oauth/${p}/start`}>
              Continue with {PROVIDER_LABELS[p] ?? p}
            </a>
          ))}
          <div className="flex items-center gap-2 py-1 text-xs text-slate-600">
            <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
          </div>
        </div>
      )}

      <form onSubmit={submit} className="mt-4 space-y-3">
        {mode === "signup" && (
          <input
            className="input"
            placeholder="Display name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          className="input"
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode !== "forgot" && (
          <input
            className="input"
            type="password"
            placeholder="Password (min 8 chars)"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {error && <p className="text-sm text-rose-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Log in" : mode === "signup" ? "Sign up" : "Send reset link"}
        </button>
      </form>

      <div className="mt-4 flex flex-col gap-2 text-sm">
        <button
          className="text-left text-indigo-300 hover:underline"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
            setNotice("");
          }}
        >
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
        </button>
        {mode === "login" && (
          <button
            className="text-left text-slate-400 hover:underline"
            onClick={() => {
              setMode("forgot");
              setError("");
              setNotice("");
            }}
          >
            Forgot your password?
          </button>
        )}
      </div>
    </div>
  );
}
