import { createContext, useContext, type ReactNode } from "react";
import { authClient } from "./lib/auth-client";
import { setToken, type PublicUser } from "./api";

// Auth is now backed by better-auth (bearer mode). This context is a thin
// adapter over `authClient.useSession()` that maps a better-auth user onto the
// existing `PublicUser` shape (displayName ← user.name) so downstream components
// (App, Studio, Settings) stay untouched.

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  /** Re-fetch the session (better-auth keeps it reactive; this forces a refetch). */
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function toPublicUser(u: {
  id: string;
  email: string;
  name?: string | null;
  emailVerified?: boolean;
}): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.name ?? null,
    emailVerified: u.emailVerified,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending, refetch } = authClient.useSession();
  const user = session?.user ? toPublicUser(session.user) : null;

  async function refresh() {
    await refetch();
  }

  async function logout() {
    await authClient.signOut().catch(() => {});
    setToken(null); // clear the bearer token (localStorage["ars_token"])
    await refetch();
  }

  return (
    <AuthContext.Provider value={{ user, loading: isPending, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
