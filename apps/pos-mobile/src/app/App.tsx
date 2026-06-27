import { useState } from "react";
import { ToastProvider } from "@pos/ui-kit";
import { useAuth } from "@pos/auth";

import LoginPage           from "../features/auth/LoginPage";
import MobileShell         from "../layout/MobileShell";
import LogoutSummaryScreen from "../features/reports/LogoutSummaryScreen";

type AppMode = "shell" | "logout-summary";

export default function App() {
  const { authenticated, role, clearSession } = useAuth();
  const [mode, setMode] = useState<AppMode>("shell");

  if (!authenticated) {
    return (
      <ToastProvider>
        <LoginPage />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      {mode === "shell" && (
        <MobileShell onLogout={() => setMode("logout-summary")} />
      )}
      {mode === "logout-summary" && (
        <LogoutSummaryScreen
          role={role}
          onContinueToLogin={clearSession}
        />
      )}
    </ToastProvider>
  );
}
