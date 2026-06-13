import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, setToken } from "../api";
import { useAuth } from "../auth";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** /verify?token=... — confirm email then bounce to the app. */
export function VerifyPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState<"working" | "ok" | "fail">("working");

  useEffect(() => {
    const token = params.get("token");
    if (!token) return setState("fail");
    api
      .verifyEmail(token)
      .then(async () => {
        await refresh();
        setState("ok");
      })
      .catch(() => setState("fail"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Shell title="Email verification">
      {state === "working" && <p className="text-slate-400">Verifying…</p>}
      {state === "ok" && (
        <p className="text-emerald-400">
          Email verified. <Link to="/app" className="underline">Go to the studio →</Link>
        </p>
      )}
      {state === "fail" && (
        <p className="text-rose-400">
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
  const { setSession } = useAuth();
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
      const { token: jwt, user } = await api.resetPassword(token, password);
      setSession(jwt, user);
      nav("/app", { replace: true });
    } catch {
      setError("This reset link is invalid or expired, or the password is too short.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Shell title="Reset password">
        <p className="text-rose-400">Missing reset token.</p>
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
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "…" : "Set password"}
        </button>
      </form>
    </Shell>
  );
}

/** /oauth?token=... — store the JWT handed back by the OAuth callback. */
export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    const token = params.get("token");
    if (!token) return void nav("/login?oauth_error=missing_token", { replace: true });
    setToken(token);
    refresh().finally(() => nav("/app", { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Shell title="Signing you in…"><p className="text-slate-400">One moment.</p></Shell>;
}
