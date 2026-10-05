import { createContext, useContext } from "react";
import type { CrmAuthSession } from "../lib/auth";

interface AuthContextValue {
  session: CrmAuthSession;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  value,
  children,
}: {
  value: AuthContextValue;
  children: React.ReactNode;
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("Auth context is not available");
  }

  return value;
}
