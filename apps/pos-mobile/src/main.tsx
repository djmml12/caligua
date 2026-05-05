import { createRoot } from "react-dom/client";
import { AuthProvider } from "@pos/auth";
import App from "./app/App";
import AppErrorBoundary from "./app/AppErrorBoundary";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </AppErrorBoundary>
);
