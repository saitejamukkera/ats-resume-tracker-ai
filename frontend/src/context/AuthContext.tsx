import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, tokenStorage } from "../lib/api";

export interface AuthUser {
  email: string;
  fullName: string;
  provider: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = tokenStorage.get();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const userData = await api.auth.me();
      setUser(userData);
    } catch {
      tokenStorage.remove();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const response = await api.auth.login(email, password);
    if (response.message && !response.email) {
      throw new Error(response.message);
    }
    setUser({
      email: response.email,
      fullName: response.fullName,
      provider: response.provider,
    });
  };

  const register = async (
    email: string,
    password: string,
    fullName: string,
  ) => {
    const response = await api.auth.register(email, password, fullName);
    if (response.message && !response.email) {
      throw new Error(response.message);
    }
    setUser({
      email: response.email,
      fullName: response.fullName,
      provider: response.provider,
    });
  };

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
