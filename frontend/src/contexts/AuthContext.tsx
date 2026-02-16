import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { api } from "../lib/api";
import type { User, TokenResponse } from "../types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const u = await api.get<User>("/auth/me");
      setUser(u);
    } catch {
      setUser(null);
      localStorage.removeItem("bh-token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const res = await api.post<TokenResponse>("/auth/login", {
      email,
      password,
    });
    localStorage.setItem("bh-token", res.access_token);
    await fetchUser();
  };

  const register = async (
    email: string,
    password: string,
    displayName: string,
  ) => {
    const res = await api.post<TokenResponse>("/auth/register", {
      email,
      password,
      display_name: displayName,
    });
    localStorage.setItem("bh-token", res.access_token);
    await fetchUser();
  };

  const logout = () => {
    localStorage.removeItem("bh-token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
