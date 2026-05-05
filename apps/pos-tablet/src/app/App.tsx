import { useEffect, useState } from "react";
import { ToastProvider } from "@pos/ui-kit";
import { useAuth } from "@pos/auth";

import LoginPage           from "../features/auth/LoginPage";
import PosScreen           from "../features/pos/PosScreen";
import AdminLayout         from "../layout/AdminLayout";
import LogoutSummaryScreen from "../features/reports/LogoutSummaryScreen";
import OrientationGuard    from "../components/OrientationGuard";

type AppMode = "pos" | "admin" | "logout-summary";

export default function App() {
  const { authenticated, role, canAccessAdmin, clearSession } = useAuth();
  const [mode, setMode] = useState<AppMode>("pos");

  useEffect(() => {
    if (mode === "admin" && !canAccessAdmin) setMode("pos");
  }, [mode, canAccessAdmin]);

  if (!authenticated) {
    return (
      <OrientationGuard>
        <ToastProvider>
          <LoginPage />
        </ToastProvider>
      </OrientationGuard>
    );
  }

  return (
    <OrientationGuard>
      <ToastProvider>
        {mode === "pos" && (
          <PosScreen
            role={role}
            onGoToAdmin={() => { if (canAccessAdmin) setMode("admin"); }}
            onLogout={() => setMode("logout-summary")}
          />
        )}

        {mode === "admin" && (
          <AdminLayout
            role={role}
            onBackToPos={() => setMode("pos")}
            onLogout={() => setMode("logout-summary")}
          />
        )}

        {mode === "logout-summary" && (
          <LogoutSummaryScreen
            role={role}
            onContinueToLogin={clearSession}
          />
        )}
      </ToastProvider>
    </OrientationGuard>
  );
}
