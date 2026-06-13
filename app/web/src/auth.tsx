import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken, getToken, type PublicUser } from "./api";

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName?: string) => Promise<void>;
  setSession: (token: string, user: PublicUser) => void;
  refresh: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { token, user } = await api.login(email, password);
    setToken(token);
    setUser(user);
  }
  async function signup(email: string, password: string, displayName?: string) {
    const { token, user } = await api.signup(email, password, displayName);
    setToken(token);
    setUser(user);
  }
  function setSession(token: string, u: PublicUser) {
    setToken(token);
    setUser(u);
  }
  async function refresh() {
    try {
      setUser(await api.me());
    } catch {
      /* keep current */
    }
  }
  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, setSession, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
