import { useEffect, useMemo, useRef, useState } from "react";
import { Button, TouchKeyboard } from "@pos/ui-kit";
import { KeyboardContext } from "../context/KeyboardContext";
import { apiRequest } from "../services/api";
import InventoryManager    from "../features/admin/InventoryManager";
import Dashboard           from "../features/admin/Dashboard";
import StaffManager        from "../features/admin/StaffManager";
import TipsManager         from "../features/admin/TipsManager";
import PrinterManager      from "../features/admin/PrinterManager";
import EmailReportsManager from "../features/admin/EmailReportsManager";
import KeyboardManager     from "../features/admin/KeyboardManager";
import "./admin.css";

/* ── Types ────────────────────────────────────────────────── */

type AdminView = "inventory" | "dashboard" | "staff" | "tips" | "printer" | "email" | "keyboard";

interface Props {
  role:        string;
  onBackToPos: () => void;
  onLogout:    () => void;
}

/* ── Icons ────────────────────────────────────────────────── */

function InventoryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function StaffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TipsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
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

function PosIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/* ── Component ────────────────────────────────────────────── */

export default function AdminLayout({ role, onBackToPos, onLogout }: Props) {
  const isAdmin      = role === "admin";
  const isSupervisor = role === "supervisor";
  const canAdmin     = isAdmin;

  const [view,           setView]           = useState<AdminView>("inventory");
  const [showKeyboard,   setShowKeyboard]   = useState(false);
  const [keyboardEnabled, setKeyboardEnabled] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void apiRequest("/settings/touch-keyboard").then((r: unknown) => {
      const res = r as Record<string, unknown>;
      if (res?.success && res.data && typeof res.data === "object") {
        const data = res.data as Record<string, unknown>;
        if (mountedRef.current) {
          const enabled = Boolean(data.enabled);
          setKeyboardEnabled(enabled);
          if (!enabled) setShowKeyboard(false);
        }
      }
    }).catch(() => {});
    return () => { mountedRef.current = false; };
  }, []);

  /* Guard: supervisor can only see inventory */
  const safeView = isSupervisor && view !== "inventory" ? "inventory" : view;

  const navItem = (
    v: AdminView,
    label: string,
    icon: React.ReactNode,
    adminOnly = false,
  ) => {
    if (adminOnly && !canAdmin) return null;
    return (
      <button
        key={v}
        className={`al-nav-btn${safeView === v ? " al-nav-btn--active" : ""}`}
        onClick={() => setView(v)}
      >
        <span className="al-nav-icon">{icon}</span>
        <span>{label}</span>
      </button>
    );
  };

  const keyboardCtx = useMemo(
    () => ({ setKeyboardOpen: setShowKeyboard, keyboardEnabled }),
    [keyboardEnabled],
  );

  return (
    <KeyboardContext.Provider value={keyboardCtx}>
    <div className="al-layout">
      {/* ── Sidebar ─────────────────────────────────── */}
      <aside className="al-sidebar">
        <div className="al-sidebar-header">
          <div className="al-sidebar-label">Panel de</div>
          <div className="al-sidebar-title">Administración</div>
        </div>

        <nav className="al-nav" aria-label="Admin navigation">
          {navItem("inventory", "Inventario",      <InventoryIcon />)}
          {navItem("dashboard", "Reportes",        <DashboardIcon />, true)}
          {navItem("staff",     "Personal",        <StaffIcon />,     true)}
          {navItem("tips",      "Propinas",        <TipsIcon />,      true)}
          {navItem("printer",   "Impresora",       <PrinterIcon />,   true)}
          {navItem("email",     "Email",           <EmailIcon />,     true)}
          {navItem("keyboard",  "Teclado virtual", <KeyboardIcon />,  true)}

          {keyboardEnabled && (
            <>
              <div className="al-nav-divider" />
              <button
                className={`al-nav-btn${showKeyboard ? " al-nav-btn--active" : ""}`}
                onClick={() => setShowKeyboard(p => !p)}
                aria-label="Abrir teclado táctil"
              >
                <span className="al-nav-icon"><KeyboardIcon /></span>
                <span>Teclado</span>
              </button>
            </>
          )}
        </nav>

        <div className="al-sidebar-footer">
          <Button variant="secondary" size="md" fullWidth onClick={onBackToPos}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PosIcon /><span>Ir a Caja</span>
            </span>
          </Button>
          <Button variant="danger" size="md" fullWidth onClick={onLogout}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LogoutIcon /><span>Cerrar sesión</span>
            </span>
          </Button>
        </div>
      </aside>

      {/* ── Content ─────────────────────────────────── */}
      <main className="al-content">
        {safeView === "inventory" && <InventoryManager role={role} />}
        {safeView === "dashboard" && canAdmin && <Dashboard />}
        {safeView === "staff"     && canAdmin && <StaffManager />}
        {safeView === "tips"      && canAdmin && <TipsManager />}
        {safeView === "printer"   && canAdmin && <PrinterManager />}
        {safeView === "email"     && canAdmin && <EmailReportsManager />}
        {safeView === "keyboard"  && canAdmin && (
          <KeyboardManager
            onToggle={(enabled) => {
              setKeyboardEnabled(enabled);
              if (!enabled) setShowKeyboard(false);
            }}
          />
        )}
      </main>

      {/* ── Anchored keyboard ───────────────────────── */}
      <TouchKeyboard open={showKeyboard} onClose={() => setShowKeyboard(false)} />
    </div>
    </KeyboardContext.Provider>
  );
}
