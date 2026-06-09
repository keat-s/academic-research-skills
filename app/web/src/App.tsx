import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { Landing } from "./pages/Landing";
import { AuthPage } from "./pages/Auth";
import { Studio } from "./pages/Studio";
import { Support } from "./pages/Support";
import { Settings } from "./pages/Settings";
import { VerifyPage, ResetPage, OAuthCallbackPage } from "./pages/AuthFlows";

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullScreen>Loading…</FullScreen>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full place-items-center text-slate-400">{children}</div>;
}

export function App() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/app" replace /> : <Landing />} />
      <Route path="/login" element={loading ? <FullScreen>…</FullScreen> : user ? <Navigate to="/app" replace /> : <AuthPage />} />
      <Route
        path="/app"
        element={
          <Protected>
            <Studio />
          </Protected>
        }
      />
      <Route
        path="/app/c/:id"
        element={
          <Protected>
            <Studio />
          </Protected>
        }
      />
      <Route
        path="/support"
        element={
          <Protected>
            <Support />
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <Settings />
          </Protected>
        }
      />
      {/* Public auth-flow routes (links arrive from email / OAuth redirects). */}
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route path="/oauth" element={<OAuthCallbackPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
