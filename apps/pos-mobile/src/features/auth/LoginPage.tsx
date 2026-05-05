import { useRef, useState } from "react";
import { Button, Input, useToast } from "@pos/ui-kit";
import { apiRequest } from "@pos/api-client";
import { useAuth } from "@pos/auth";
import type { AuthUser } from "@pos/types";
import "./login.css";

/* ── Icons ───────────────────────────────────────────────── */

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

/* ── Component ───────────────────────────────────────────── */

export default function LoginPage() {
  const { login }   = useAuth();
  const { show }    = useToast();
  const [identifier,   setIdentifier]       = useState("");
  const [password,     setPassword]         = useState("");
  const [loading,      setLoading]          = useState(false);
  const [showPassword, setShowPassword]     = useState(false);
  const [error,        setError]            = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const handleLogin = async () => {
    if (loading) return;

    const trimmedId = identifier.trim();
    if (!trimmedId || !password) {
      setError("Completá usuario y contraseña.");
      navigator.vibrate?.([10, 80, 10]);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: trimmedId, password }),
      }) as { token: string; user: AuthUser };

      login(data.user, data.token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al ingresar";
      setError(msg);
      show(msg, { type: "error" });
      navigator.vibrate?.([10, 80, 10]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mlp-shell">

      {/* ── Header: logo + marca ── */}
      <div className="mlp-header">
        <div className="mlp-logo-ring">
          <img src="/logo.jpeg" alt="Caligua BBQ & Grill" className="mlp-logo" />
        </div>
        <p className="mlp-brand-name">Caligua</p>
        <p className="mlp-brand-sub">BBQ &amp; Grill</p>
      </div>

      {/* ── Formulario ── */}
      <div className="mlp-body">
        <form
          ref={formRef}
          className="mlp-form"
          onSubmit={(e) => { e.preventDefault(); void handleLogin(); }}
        >
          <p className="mlp-kicker">Acceso al sistema</p>
          <h1 className="mlp-heading">Bienvenido</h1>

          <Input
            label="Usuario"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />

          <Input
            label="Contraseña"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            rightElement={
              <button
                type="button"
                className="mlp-eye-btn"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            }
          />

          {error && (
            <p className="mlp-error" role="alert">{error}</p>
          )}

          <Button
            variant="primary"
            size="xl"
            fullWidth
            loading={loading}
            onClick={() => void handleLogin()}
          >
            Ingresar
          </Button>
        </form>
      </div>
    </div>
  );
}
