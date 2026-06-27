import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { AuthUser } from "@pos/types";

export type { AuthUser };

interface AuthContextValue {
  currentUser:    AuthUser | null;
  authenticated:  boolean;
  role:           string;
  canAccessAdmin: boolean;
  login:          (user: AuthUser, token: string) => void;
  clearSession:   () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const getStoredUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
};

const normaliseRole = (user: AuthUser | null) =>
  String(user?.role ?? user?.role_name ?? "").toLowerCase();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(getStoredUser);
  const [authenticated, setAuthenticated] = useState(
    () => Boolean(localStorage.getItem("token") && getStoredUser())
  );

  const role          = normaliseRole(currentUser);
  const canAccessAdmin = role === "admin" || role === "supervisor";

  const login = (user: AuthUser, token: string) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    setCurrentUser(user);
    setAuthenticated(true);
  };

  const clearSession = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setCurrentUser(null);
    setAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ currentUser, authenticated, role, canAccessAdmin, login, clearSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be called inside <AuthProvider>");
  return ctx;
}
