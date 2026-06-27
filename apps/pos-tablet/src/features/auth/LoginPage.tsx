import { useEffect, useRef, useState } from "react";
import { Button, Input, TouchKeyboard } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";
import { useAuth } from "@pos/auth";
import type { AuthUser } from "@pos/types";
import "./login.css";

function EyeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h.01M12 13h.01M16 13h.01M6 17h12" />
    </svg>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const [identifier,   setIdentifier]   = useState("");
  const [password,     setPassword]     = useState("");
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showKeyboard) return;
    const timer = setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 80);
    return () => clearTimeout(timer);
  }, [showKeyboard]);

  const handleLogin = async () => {
    if (loading) return;

    const trimmedId = identifier.trim();
    if (!trimmedId || !password) {
      setError("Completa usuario y contraseña.");
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

      setShowKeyboard(false);
      login(data.user, data.token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al ingresar";
      setError(msg);
      navigator.vibrate?.([10, 80, 10]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`lp-shell${showKeyboard ? " lp-shell--kb-open" : ""}`}>

      {/* ── Left panel: dark, logo + brand ── */}
      <div className="lp-left">
        <div className="lp-left-inner">
          <div className="lp-logo-ring">
            <img src="/logo.jpeg" alt="Caligua BBQ & Grill" className="lp-logo" />
          </div>
          <p className="lp-brand-name">Caligua</p>
          <p className="lp-brand-sub">BBQ &amp; Grill</p>
        </div>
      </div>

      {/* ── Right panel: form ── */}
      <div className="lp-right">
        <div className="lp-right-inner" ref={formRef}>

          <p className="lp-kicker">Acceso al sistema</p>
          <h1 className="lp-heading">Bienvenido</h1>

          <div className="lp-form">

            <Input
              label="Usuario"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onFocus={() => setShowKeyboard(true)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleLogin(); }}
            />

            <Input
              label="Contraseña"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setShowKeyboard(true)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleLogin(); }}
              rightElement={
                <button
                  type="button"
                  className="lp-eye-btn"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              }
            />

            <div className={`lp-error${error ? " lp-error--visible" : ""}`} role="alert" aria-live="polite">
              {error && (
                <>
                  <AlertIcon />
                  <span>{error}</span>
                </>
              )}
            </div>

            <Button
              variant="primary"
              size="xl"
              fullWidth
              loading={loading}
              onClick={() => void handleLogin()}
            >
              Ingresar
            </Button>

          </div>
        </div>
      </div>

      {/* Keyboard button — fixed bottom-left */}
      <button
        type="button"
        className={`lp-kb-btn${showKeyboard ? " lp-kb-btn--active" : ""}`}
        onClick={() => setShowKeyboard((p) => !p)}
        aria-label={showKeyboard ? "Cerrar teclado" : "Abrir teclado táctil"}
      >
        <KeyboardIcon />
        <span>Teclado</span>
      </button>

      {/* Anchored keyboard */}
      <TouchKeyboard open={showKeyboard} onClose={() => setShowKeyboard(false)} />
    </div>
  );
}
