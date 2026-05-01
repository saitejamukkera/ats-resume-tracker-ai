"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api, onSessionExpired, ensureCsrfToken } from "../lib/api";
import { SessionExpiredModal } from "../components/SessionExpiredModal";

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
  refreshUser: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const router = useRouter();
  const userRef = useRef<AuthUser | null>(null);

  const refreshUser = useCallback(async (): Promise<boolean> => {
    try {
      const userData = await api.auth.me();
      const authUser: AuthUser = {
        email: userData.email,
        fullName: userData.fullName,
        provider: userData.provider,
      };
      setUser(authUser);
      userRef.current = authUser;
      setLoading(false);
      return true;
    } catch {
      setUser(null);
      userRef.current = null;
      setLoading(false);
      return false;
    }
  }, []);

  useEffect(() => {
    ensureCsrfToken().then(() => refreshUser());
  }, [refreshUser]);

  useEffect(() => {
    const unsubscribe = onSessionExpired(() => {
      setUser(null);
      userRef.current = null;
      setSessionExpired(true);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.auth.login(email, password);
    if (response.message && !response.email) {
      throw new Error(response.message);
    }
    setSessionExpired(false);
    const authUser: AuthUser = {
      email: response.email,
      fullName: response.fullName,
      provider: response.provider,
    };
    setUser(authUser);
    userRef.current = authUser;
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
    setSessionExpired(false);
    const authUser: AuthUser = {
      email: response.email,
      fullName: response.fullName,
      provider: response.provider,
    };
    setUser(authUser);
    userRef.current = authUser;
  };

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
    userRef.current = null;
  };

  const handleSessionExpiredLogin = () => {
    setSessionExpired(false);
    router.push("/login");
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshUser }}
    >
      {children}
      <SessionExpiredModal
        open={sessionExpired}
        onLogin={handleSessionExpiredLogin}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
