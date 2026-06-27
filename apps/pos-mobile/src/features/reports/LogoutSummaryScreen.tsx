import { useEffect, useRef, useState } from "react";
import { Button, Spinner, useToast } from "@pos/ui-kit";
import { apiRequest } from "@pos/api-client";
import "./logout-summary.css";

/* ── Types ────────────────────────────────────────────────── */

interface SaleEntry {
  id:             number;
  monthly_number?: number;
  total:          number;
  tip?:           number;
}

interface DailySummary {
  date:                string;
  sales:               SaleEntry[];
  total_sales_amount:  number;
  total_tips:          number;
  total_collected:     number;
  total_profit:        number;
}

interface Props {
  role?:             string;
  onContinueToLogin: () => void;
}

/* ── Helpers ──────────────────────────────────────────────── */

const fmt = (n: number) =>
  new Intl.NumberFormat("es-GT", {
    style:                 "currency",
    currency:              "GTQ",
    minimumFractionDigits: 2,
  }).format(n);

/* ── Icons ────────────────────────────────────────────────── */

function EmailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/* ── Component ────────────────────────────────────────────── */

const empty: DailySummary = {
  date: "", sales: [],
  total_sales_amount: 0, total_tips: 0,
  total_collected: 0, total_profit: 0,
};

export default function LogoutSummaryScreen({ role, onContinueToLogin }: Props) {
  const { show }   = useToast();
  const mountedRef = useRef(true);

  const [summary,      setSummary]      = useState<DailySummary>(empty);
  const [loading,      setLoading]      = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    void apiRequest("/reports/logout-summary/today")
      .then((r: unknown) => {
        const d = r as Record<string, unknown>;
        if (mountedRef.current) setSummary((d?.data ?? d) as DailySummary ?? empty);
      })
      .catch(() => {
        if (mountedRef.current) show("No se pudo cargar el resumen", { type: "error" });
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => { mountedRef.current = false; };
  }, [show]);

  const handleEmail = async () => {
    setSendingEmail(true);
    try {
      await apiRequest("/reports/logout-summary/email", { method: "POST" });
      if (mountedRef.current) show("Resumen enviado por correo", { type: "success" });
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "No se pudo enviar", { type: "error" });
    } finally {
      if (mountedRef.current) setSendingEmail(false);
    }
  };

  const isAdmin = String(role ?? "").toLowerCase() === "admin";

  return (
    <div className="ls-shell">
      <div className="ls-bg" aria-hidden="true" />

      <div className="ls-card">

        {/* ── Header ────────────────────────────────────── */}
        <div className="ls-header">
          <div className="ls-moon-icon" aria-hidden="true"><MoonIcon /></div>
          <div>
            <h1 className="ls-title">Cierre del día</h1>
            {!loading && summary.date && (
              <p className="ls-date">{summary.date}</p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="ls-loading">
            <Spinner size="lg" />
            <span>Cargando resumen...</span>
          </div>
        ) : (
          <>
            {/* ── KPI row ──────────────────────────────── */}
            <div className="ls-kpi-grid">
              <div className="ls-kpi-card">
                <span className="ls-kpi-label">Ventas totales</span>
                <span className="ls-kpi-value">{fmt(summary.total_sales_amount)}</span>
              </div>
              <div className="ls-kpi-card">
                <span className="ls-kpi-label">Propinas</span>
                <span className="ls-kpi-value">{fmt(summary.total_tips)}</span>
              </div>
              <div className="ls-kpi-card ls-kpi-card--highlight">
                <span className="ls-kpi-label">Total del día</span>
                <span className="ls-kpi-value">{fmt(summary.total_collected)}</span>
              </div>
              <div className="ls-kpi-card ls-kpi-card--profit">
                <span className="ls-kpi-label">Utilidad</span>
                <span className="ls-kpi-value">{fmt(summary.total_profit)}</span>
              </div>
            </div>

            {/* ── Tips note ────────────────────────────── */}
            {summary.total_tips > 0 && (
              <p className="ls-tips-note">
                * Las propinas son una cuenta aparte y no se incluyen en las utilidades.
              </p>
            )}

            {/* ── Sales list ───────────────────────────── */}
            <div className="ls-sales-wrap">
              <div className="ls-sales-title">
                Ventas del día
                <span className="ls-sales-count">{summary.sales.length}</span>
              </div>

              {summary.sales.length === 0 ? (
                <p className="ls-empty">No hubo ventas hoy.</p>
              ) : (
                <div className="ls-sales-list">
                  {summary.sales.map(sale => (
                    <div key={sale.id} className="ls-sale-row">
                      <span className="ls-sale-id">#{sale.monthly_number ?? sale.id}</span>
                      <span className="ls-sale-total">{fmt(sale.total)}</span>
                      {sale.tip ? (
                        <span className="ls-sale-tip">+{fmt(sale.tip)} prop.</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Actions ──────────────────────────────── */}
            <div className="ls-actions">
              {isAdmin && (
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  loading={sendingEmail}
                  onClick={() => void handleEmail()}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <EmailIcon /><span>Enviar resumen por email</span>
                  </span>
                </Button>
              )}
              <Button
                variant="primary"
                size="xl"
                fullWidth
                onClick={onContinueToLogin}
              >
                Terminar día
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
