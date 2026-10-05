"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import api, { setTokens, clearTokens, getAccessToken } from "./api";
import type { User, Role } from "@/types";

interface AuthContextValue {
  user: User | null;
  role: Role | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  organizationName: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Persist full user object across page refreshes */
const STORAGE_KEY = "cmf_user";

const saveUser = (user: User) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));

const loadStoredUser = (): User | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

const clearStoredUser = () => localStorage.removeItem(STORAGE_KEY);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const setUser = (u: User | null) => {
    setUserState(u);
    if (u) saveUser(u);
    else clearStoredUser();
  };

  /**
   * On mount: restore user from localStorage (instant, no flicker)
   * then validate the token is still alive via /auth/me.
   * /auth/me returns JWT payload only — if it 401s, tokens are expired.
   */
  const loadUser = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    // Restore immediately from localStorage to avoid loading flash
    const stored = loadStoredUser();
    if (stored) setUserState(stored);

    try {
      // Validate token is still alive (will trigger refresh interceptor if expired)
      await api.get("/auth/me");
      // Token is valid — user is already set from storage above
    } catch {
      // Token fully expired (refresh also failed) — clear everything
      clearTokens();
      clearStoredUser();
      setUserState(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    const { accessToken, refreshToken, user: loggedInUser } = data.data;
    setTokens(accessToken, refreshToken);
    setUser(loggedInUser);
    router.push("/dashboard");
  };

  const register = async (formData: RegisterData) => {
    const { data } = await api.post("/auth/register", formData);
    const { accessToken, refreshToken, user: newUser } = data.data;
    setTokens(accessToken, refreshToken);
    setUser(newUser);
    router.push("/dashboard");
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Swallow — still clear local state
    } finally {
      clearTokens();
      setUser(null);
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
