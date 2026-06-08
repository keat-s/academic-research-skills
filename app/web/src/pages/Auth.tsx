import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError } from "../api";

const ERROR_COPY: Record<string, string> = {
  invalid_email: "That doesn't look like a valid email.",
  password_too_short: "Password must be at least 8 characters.",
  email_taken: "An account with that email already exists.",
  invalid_credentials: "Email or password is incorrect.",
};

export function AuthPage() {
  const { login, signup } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") await signup(email, password, name || undefined);
      else await login(email, password);
      nav("/app", { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "error";
      setError(ERROR_COPY[code] ?? "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold text-white">
        {mode === "login" ? "Welcome back" : "Create your free account"}
      </h1>
      <p className="mt-1 text-sm text-slate-400">No subscription. AI features are free.</p>

      <form onSubmit={submit} className="mt-6 space-y-3">
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
        <input
          className="input"
          type="password"
          placeholder="Password (min 8 chars)"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>

      <button
        className="mt-4 text-sm text-indigo-300 hover:underline"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError("");
        }}
      >
        {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
      </button>
    </div>
  );
}
