import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth-client";
import { api } from "../api";
import scioMark from "../scio/assets/scio-mark.svg";
import scioWordmark from "../scio/assets/scio-wordmark.svg";

const PROVIDER_LABELS: Record<string, string> = { google: "Google", github: "GitHub" };

const ERROR_COPY: Record<string, string> = {
  INVALID_EMAIL: "That doesn't look like a valid email.",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
  USER_ALREADY_EXISTS: "An account with that email already exists.",
  INVALID_EMAIL_OR_PASSWORD: "Email or password is incorrect.",
};

function copyFor(code?: string, message?: string): string {
  if (code && ERROR_COPY[code]) return ERROR_COPY[code];
  return message || "Something went wrong. Try again.";
}

export function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // Only show a social button for a provider the server has actually configured.
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    api.socialProviders().then(setProviders).catch(() => setProviders([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset`,
        });
        setNotice("If that email has an account, a reset link is on its way.");
      } else if (mode === "signup") {
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: name || email,
        });
        if (err) throw err;
        nav("/app", { replace: true });
      } else {
        const { error: err } = await authClient.signIn.email({ email, password });
        if (err) throw err;
        nav("/app", { replace: true });
      }
    } catch (err) {
      const e2 = err as { code?: string; message?: string };
      setError(copyFor(e2.code, e2.message));
    } finally {
      setBusy(false);
    }
  }

  async function social(provider: "google" | "github") {
    setError("");
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: `${window.location.origin}/app`,
      });
    } catch (err) {
      const e2 = err as { message?: string };
      setError(e2.message || "That sign-in method isn't available.");
    }
  }

  const title =
    mode === "login" ? "Welcome back" : mode === "signup" ? "Create your free account" : "Reset your password";

  return (
    <div className="flex min-h-full">
      {/* Left — form panel */}
      <div className="flex flex-1 flex-col justify-center px-8 py-12 bg-background lg:max-w-md xl:max-w-lg">
        {/* Brand */}
        <div className="flex items-center gap-2.5 mb-10">
          <img src={scioMark} alt="Scio mark" className="h-7 w-7" />
          <img src={scioWordmark} alt="Scio" className="h-4" />
        </div>

        <p
          className="mb-1 text-xs font-mono uppercase tracking-[0.08em]"
          style={{ color: "var(--text-subtle)" }}
        >
          {mode === "login" ? "Sign in" : mode === "signup" ? "New account" : "Password reset"}
        </p>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">No subscription. AI features are free.</p>

        {mode !== "forgot" && providers.length > 0 && (
          <div className="mt-6 space-y-2">
            {providers.map((p) => (
              <button
                key={p}
                type="button"
                className="btn-ghost w-full"
                onClick={() => social(p as "google" | "github")}
              >
                Continue with {PROVIDER_LABELS[p] ?? p}
              </button>
            ))}
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm" style={{ color: "var(--success)" }}>{notice}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "…" : mode === "login" ? "Log in" : mode === "signup" ? "Sign up" : "Send reset link"}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-2 text-sm">
          <button
            className="text-left hover:underline"
            style={{ color: "var(--text-link)" }}
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
              className="text-left text-muted-foreground hover:underline"
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

      {/* Right — ink panel with pull-quote (hidden on small screens) */}
      <div
        className="hidden lg:flex flex-1 flex-col justify-center px-12 scio-dotgrid-invert"
        style={{ background: "var(--surface-inverse)" }}
      >
        <blockquote
          className="font-serif italic text-2xl leading-relaxed max-w-sm"
          style={{ color: "var(--teal-200)", borderLeft: "2px solid var(--teal-500)", paddingLeft: "1.25rem" }}
        >
          "Rigour is a habit, not an event."
        </blockquote>
        <p className="mt-4 text-sm" style={{ color: "var(--n-500)" }}>
          25 research and writing workflows, grounded in live citations.
        </p>
      </div>
    </div>
  );
}
