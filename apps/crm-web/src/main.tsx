import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { loadCrmSession, loginCrm, logoutCrm, type CrmAuthSession } from "./lib/auth";
import "./styles.css";
import { LoginPage } from "./ui/LoginPage";
import { AuthProvider } from "./ui/AuthContext";
import { registerCrmBrowserPush } from "./lib/browser-push";

function CrmRoot() {
  const [session, setSession] = React.useState<CrmAuthSession | null>(() => loadCrmSession());
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleLogin(login: string, password: string) {
    setIsSubmitting(true);
    setError(null);

    try {
      const nextSession = await loginCrm(login, password);
      setSession(nextSession);
      void registerCrmBrowserPush();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось войти. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    await logoutCrm(session);
    setSession(null);
    setError(null);
  }

  React.useEffect(() => {
    if (session) {
      void registerCrmBrowserPush();
    }
  }, [session]);

  if (!session) {
    return <LoginPage isSubmitting={isSubmitting} error={error} onSubmit={handleLogin} />;
  }

  return (
    <AuthProvider value={{ session, signOut: handleSignOut }}>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CrmRoot />
  </React.StrictMode>,
);
