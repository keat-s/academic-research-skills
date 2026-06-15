import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authClient } from "../lib/auth-client";
import { useAuth } from "../auth";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/**
 * /verify?token=... — confirm email then bounce to the app.
 * better-auth's verification email normally links straight at the server
 * endpoint, but we keep this page as a token-handling fallback.
 */
export function VerifyPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState<"working" | "ok" | "fail">("working");

  useEffect(() => {
    const token = params.get("token");
    if (!token) return setState("fail");
    authClient
      .verifyEmail({ query: { token } })
      .then(async ({ error }) => {
        if (error) return setState("fail");
        await refresh();
        setState("ok");
      })
      .catch(() => setState("fail"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Shell title="Email verification">
      {state === "working" && <p className="text-muted-foreground">Verifying…</p>}
      {state === "ok" && (
        <p style={{ color: "var(--success)" }}>
          Email verified. <Link to="/app" className="underline">Go to the studio</Link>
        </p>
      )}
      {state === "fail" && (
        <p className="text-destructive">
          This link is invalid or expired. <Link to="/app" className="underline">Open the app</Link> and
          resend from Settings.
        </p>
      )}
    </Shell>
  );
}

/** /reset?token=... — set a new password. */
export function ResetPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const token = params.get("token") ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { error: err } = await authClient.resetPassword({ newPassword: password, token });
      if (err) throw err;
      nav("/login", { replace: true });
    } catch {
      setError("This reset link is invalid or expired, or the password is too short.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Shell title="Reset password">
        <p className="text-destructive">Missing reset token.</p>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit} className="space-y-3">
        <input
          className="input"
          type="password"
          placeholder="New password (min 8 chars)"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "…" : "Set password"}
        </button>
      </form>
    </Shell>
  );
}

/**
 * /oauth — legacy social-callback landing route. better-auth now handles the
 * social round-trip itself (its callback redirects to the `callbackURL` we pass
 * to `signIn.social`, i.e. /app). This page just refreshes the session and
 * bounces, so any stale links still work.
 */
export function OAuthCallbackPage() {
  const { refresh } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    refresh().finally(() => nav("/app", { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Shell title="Signing you in…"><p className="text-muted-foreground">One moment.</p></Shell>;
}
