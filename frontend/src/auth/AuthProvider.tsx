import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "@/auth/types";
import { isManagerRole } from "@/auth/types";
import {
  clearSessionToken,
  handleUnauthorized,
  loadSessionToken,
  setSessionToken,
  setUnauthorizedHandler,
} from "@/auth/session";
import { fetchMe, loginWithPassword } from "@/services/auth";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isInitializing: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    clearSessionToken();
  }, []);

  const logout = useCallback(() => {
    clearSession();

    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  }, [clearSession]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();

      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    });

    return () => {
      setUnauthorizedHandler(undefined);
    };
  }, [clearSession]);

  useEffect(() => {
    const restoreSession = async () => {
      const storedToken = loadSessionToken();

      if (!storedToken) {
        setIsInitializing(false);
        return;
      }

      setToken(storedToken);

      try {
        const restoredUser = await fetchMe();
        setUser(restoredUser);
      } catch {
        handleUnauthorized();
      } finally {
        setIsInitializing(false);
      }
    };

    void restoreSession();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await loginWithPassword(email, password);

    setSessionToken(response.token, true);
    setToken(response.token);
    setUser(response.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isInitializing,
      isAuthenticated: Boolean(user && token),
      login,
      logout,
    }),
    [user, token, isInitializing, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }

  return context;
};

export const useRoleAccess = () => {
  const { user } = useAuth();
  const role = user?.role;

  return {
    role,
    isManager: isManagerRole(role),
    isEmployee: role === "funcionario",
    canManageEmployees: isManagerRole(role),
    canManageTeams: isManagerRole(role),
    canCreateProduction: isManagerRole(role),
    canCompleteProduction: isManagerRole(role),
    canViewFinancials: isManagerRole(role),
  };
};
