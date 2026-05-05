import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Spinner, useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";
import { generateRangeReportPDF, type RangeReportInput, type SaleRow as RpSale } from "./report/pdfGenerator";
import { generateRangeReportXLSX } from "./report/excelGenerator";
import type { Point } from "./report/charts";

/* ── Types ────────────────────────────────────────────────── */

interface KPIData {
  total_sales:              number;
  avg_ticket:               number;
  total_profit:             number;
  total_tips:               number;
  inventory_value:          number;
  critical_products:        number;
  low_stock_threshold:      number;
  critical_stock_threshold: number;
  top_product:              { name: string; units: number } | null;
  top_seller:               { name: string; total_sold: number } | null;
}

interface StockAlertRow {
  name:     string;
  stock:    number;
  category: string;
}

interface SaleRow {
  id:     number;
  seller: string;
  total:  number;
  tip:    number;
  date:   string;   /* YYYY-MM-DD — from created_at */
}

type Preset = "diario" | "semanal" | "mensual";

/* ── Helpers ──────────────────────────────────────────────── */

const fmt = (n: number) =>
  new Intl.NumberFormat("es-GT", {
    style: "currency", currency: "GTQ", minimumFractionDigits: 2,
  }).format(n);

const fmtShort = (n: number) =>
  new Intl.NumberFormat("es-GT", {
    style: "currency", currency: "GTQ",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
    notation: n >= 1_000_000 ? "compact" : "standard",
  }).format(n);

const fmtDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const presetRange = (p: Preset): { from: string; to: string } => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === "diario")  return { from: fmtDate(end), to: fmtDate(end) };
  if (p === "semanal") {
    const s = new Date(end); s.setDate(end.getDate() - 6);
    return { from: fmtDate(s), to: fmtDate(end) };
  }
  const s = new Date(end.getFullYear(), end.getMonth(), 1);
  return { from: fmtDate(s), to: fmtDate(end) };
};

/* Abbreviate a YYYY-MM-DD label for the chart x-axis */
const dayLabel = (dateStr: string, totalDays: number): string => {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  if (totalDays <= 7) {
    const names = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const dow = new Date(dateStr + "T12:00:00").getDay();
    return names[dow] ?? d;
  }
  return `${parseInt(d)}/${parseInt(m)}`;
};

/* ── BarChart — vertical SVG bars ─────────────────────────── */

interface BarPoint { label: string; value: number; }

function BarChart({
  data,
  title,
  color = "var(--primary)",
  formatValue = fmtShort,
}: {
  data:          BarPoint[];
  title:         string;
  color?:        string;
  formatValue?:  (n: number) => string;
}) {
  /* SVG coordinate system */
  const W        = 400;
  const CHART_H  = 140;
  const LABEL_H  = 40;
  const H        = CHART_H + LABEL_H;
  const PAD_X    = 6;
  const TOP_PAD  = 28;                         /* room for value label above bar */
  const MAX_BAR  = CHART_H - TOP_PAD;

  const maxVal   = Math.max(...data.map(d => d.value), 1);
  const n        = Math.max(data.length, 1);
  const slotW    = (W - PAD_X * 2) / n;
  const barW     = Math.min(slotW * 0.55, 40);

  /* Grid Y positions — 3 horizontal guides */
  const guides   = [0.33, 0.66, 1].map(r => ({
    y:     TOP_PAD + MAX_BAR * (1 - r),
    label: formatValue(maxVal * r),
  }));

  if (data.length === 0) return null;

  return (
    <div className="dash-chart-wrap">
      <div className="dash-chart-title">{title}</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        aria-label={title}
        style={{ overflow: "visible", display: "block" }}
      >
        {/* Guide lines */}
        {guides.map((g, i) => (
          <g key={i}>
            <line
              x1={PAD_X} y1={g.y} x2={W - PAD_X} y2={g.y}
              stroke="var(--border)" strokeWidth="1"
              strokeDasharray={i === 2 ? "0" : "3 3"}
            />
            <text
              x={PAD_X} y={g.y - 3}
              fontSize="9" fill="var(--text-3)" fontWeight="600"
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const ratio = d.value / maxVal;
          const bh    = Math.max(ratio * MAX_BAR, d.value > 0 ? 3 : 0);
          const cx    = PAD_X + slotW * i + slotW / 2;
          const x     = cx - barW / 2;
          const y     = CHART_H - bh;

          return (
            <g key={i}>
              {/* Bar body */}
              <rect
                className="dash-bar"
                x={x} y={y}
                width={barW} height={bh}
                rx={4} ry={4}
                fill={color}
                style={{ animationDelay: `${i * 35}ms` }}
              />

              {/* Value above bar */}
              {d.value > 0 && (
                <text
                  className="dash-bar-label"
                  x={cx} y={y - 5}
                  textAnchor="middle"
                  fontSize="10" fontWeight="700"
                  fill="var(--text-2)"
                  style={{ animationDelay: `${i * 35 + 200}ms` }}
                >
                  {formatValue(d.value)}
                </text>
              )}

              {/* X axis label */}
              <text
                x={cx} y={CHART_H + 16}
                textAnchor="middle"
                fontSize={slotW < 28 ? "8" : "10"}
                fontWeight="600"
                fill="var(--text-3)"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── HBarChart — horizontal bars (by seller) ──────────────── */

function HBarChart({
  data,
  title,
  formatValue = fmt,
}: {
  data:         BarPoint[];
  title:        string;
  formatValue?: (n: number) => string;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  if (data.length === 0) return null;

  return (
    <div className="dash-chart-wrap">
      <div className="dash-chart-title">{title}</div>
      <div className="dash-hbar-list">
        {data.map((d, i) => (
          <div key={i} className="dash-hbar-row">
            <div className="dash-hbar-label" title={d.label}>{d.label}</div>
            <div className="dash-hbar-track">
              <div
                className="dash-hbar-fill"
                style={{
                  "--hbar-pct": `${(d.value / max) * 100}%`,
                  animationDelay: `${i * 50}ms`,
                } as React.CSSProperties}
              />
            </div>
            <div className="dash-hbar-value">{formatValue(d.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Component ────────────────────────────────────────────── */

function PrintIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

export default function Dashboard() {
  const mountedRef  = useRef(true);
  const { show }    = useToast();

  const [preset,            setPreset]            = useState<Preset>("semanal");
  const [from,              setFrom]              = useState(() => presetRange("semanal").from);
  const [to,                setTo]                = useState(() => fmtDate(new Date()));
  const [loading,           setLoading]           = useState(false);
  const [kpi,               setKpi]               = useState<KPIData | null>(null);
  const [sales,             setSales]             = useState<SaleRow[]>([]);
  const [printLoading,      setPrintLoading]      = useState(false);
  const [printingIds,       setPrintingIds]       = useState<Set<number>>(new Set());
  const [reportFormat,      setReportFormat]      = useState<"excel" | "pdf">("excel");
  const [downloadingPreset, setDownloadingPreset] = useState<Preset | null>(null);
  const [emailingPreset,    setEmailingPreset]    = useState<Preset | null>(null);
  const [stockAlerts,       setStockAlerts]       = useState<StockAlertRow[]>([]);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    try {
      const [kpiRes, salesRes, invRes] = await Promise.all([
        apiRequest(`/reports/dashboard?from=${f}&to=${t}`),
        apiRequest(`/reports/sales?from=${f}&to=${t}`),
        apiRequest(`/reports/inventory`),
      ]) as [unknown, unknown, unknown];

      const kpiData  = ((kpiRes  as Record<string, unknown>)?.data ?? kpiRes)  as KPIData;
      const rawSales = ((salesRes as Record<string, unknown>)?.data ?? salesRes) as unknown[];
      const rawInv   = ((invRes   as Record<string, unknown>)?.data ?? invRes)  as unknown[];

      if (!mountedRef.current) return;
      setKpi(kpiData);
      setSales((Array.isArray(rawSales) ? rawSales : []).map((s: unknown) => {
        const r = s as Record<string, unknown>;
        const rawDate = String(r.created_at ?? r.date ?? "");
        return {
          id:     Number(r.id),
          seller: String(r.seller ?? r.seller_name ?? "N/A"),
          total:  Number(r.total ?? 0),
          tip:    Number(r.tip_amount ?? r.tip ?? 0),
          date:   rawDate.slice(0, 10),
        };
      }));

      const lowThresh  = Number(kpiData.low_stock_threshold  ?? 15);
      setStockAlerts(
        (Array.isArray(rawInv) ? rawInv : [])
          .map((p: unknown) => {
            const r = p as Record<string, unknown>;
            return {
              name:     String(r.name ?? ""),
              stock:    Number(r.stock ?? 0),
              category: String(r.category ?? ""),
            };
          })
          .filter(p => p.stock <= lowThresh)
      );
    } catch (err) {
      console.error("Dashboard load error:", err);
      if (mountedRef.current) show("Error cargando el dashboard", { type: "error" });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [show]);

  const handlePrintRange = async () => {
    if (dayCount > 7 && !window.confirm(
      `Se imprimirán ${sales.length} ventas de ${dayCount} días.\n¿Continuar?`
    )) return;
    setPrintLoading(true);
    try {
      await apiRequest(`/print/summary?from=${from}&to=${to}`, { method: "POST", timeoutMs: 15_000 });
      if (mountedRef.current) show("Resumen enviado a la impresora", { type: "success" });
    } catch {
      if (mountedRef.current) show("Impresora no disponible — revisa configuración", { type: "error" });
    } finally {
      if (mountedRef.current) setPrintLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void load(from, to);
    return () => { mountedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const range = presetRange(p);
    setFrom(range.from);
    setTo(range.to);
    void load(range.from, range.to);
  };

  const handleDownload = async (p: Preset) => {
    setDownloadingPreset(p);
    try {
      const { from: f, to: t } = presetRange(p);

      // Cargar datos para el rango pedido (puede diferir del rango actual)
      const [kpiRes, salesRes] = await Promise.all([
        apiRequest(`/reports/dashboard?from=${f}&to=${t}`),
        apiRequest(`/reports/sales?from=${f}&to=${t}`),
      ]) as [unknown, unknown];

      const kpiData  = ((kpiRes  as Record<string, unknown>)?.data ?? kpiRes)  as KPIData;
      const rawSales = ((salesRes as Record<string, unknown>)?.data ?? salesRes) as unknown[];

      const reportSales: RpSale[] = (Array.isArray(rawSales) ? rawSales : []).map((s) => {
        const r = s as Record<string, unknown>;
        const rawDate = String(r.created_at ?? r.date ?? "");
        return {
          id:     Number(r.id),
          seller: String(r.seller ?? r.seller_name ?? "N/A"),
          total:  Number(r.total ?? 0),
          tip:    Number(r.tip_amount ?? r.tip ?? 0),
          date:   rawDate.slice(0, 10),
        };
      });

      // Días del rango
      const dayMs = 86_400_000;
      const days = Math.max(Math.round((new Date(t).getTime() - new Date(f).getTime()) / dayMs) + 1, 1);

      // Agregar por día (rellenar todos los días aunque sean 0)
      const dayMap = new Map<string, number>();
      reportSales.forEach((s) => {
        if (s.date) dayMap.set(s.date, (dayMap.get(s.date) ?? 0) + s.total);
      });
      const sbd: Point[] = [];
      const cur = new Date(f + "T12:00:00");
      const end = new Date(t + "T12:00:00");
      while (cur <= end) {
        const key = fmtDate(cur);
        sbd.push({ label: dayLabel(key, days), value: dayMap.get(key) ?? 0 });
        cur.setDate(cur.getDate() + 1);
      }

      // Agregar por vendedor
      const sellerMap = new Map<string, number>();
      reportSales.forEach((s) => {
        if (!s.seller || s.seller === "N/A") return;
        sellerMap.set(s.seller, (sellerMap.get(s.seller) ?? 0) + s.total);
      });
      const sbs: Point[] = [...sellerMap.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

      // Top productos: del kpi solo viene 1 (top_product). Lo dejamos vacío
      // a menos que el endpoint lo provea en el futuro.
      const topProducts: Point[] = kpiData.top_product
        ? [{ label: kpiData.top_product.name, value: kpiData.top_product.units }]
        : [];

      const input: RangeReportInput = {
        label:         p,
        from:          f,
        to:            t,
        kpi:           kpiData,
        sales:         reportSales,
        salesByDay:    sbd,
        salesBySeller: sbs,
        topProducts,
      };

      const baseName = `reporte_${p}_${f}_a_${t}`;
      let blob: Blob;
      let filename: string;

      if (reportFormat === "pdf") {
        const doc = generateRangeReportPDF(input);
        blob = doc.output("blob");
        filename = `${baseName}.pdf`;
      } else {
        blob = generateRangeReportXLSX(input);
        filename = `${baseName}.xlsx`;
      }

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err: unknown) {
      console.error("Download report error:", err);
      show(err instanceof Error ? err.message : "Error al descargar el reporte", { type: "error" });
    } finally {
      if (mountedRef.current) setDownloadingPreset(null);
    }
  };

  const handlePrintSale = async (saleId: number) => {
    if (printingIds.has(saleId)) return;
    setPrintingIds(prev => new Set(prev).add(saleId));
    try {
      await apiRequest("/print/receipt", {
        method: "POST",
        body: JSON.stringify({ sale_id: saleId }),
        timeoutMs: 10_000,
      });
      if (mountedRef.current) show("Ticket enviado a la impresora", { type: "success" });
    } catch (err: unknown) {
      if (mountedRef.current)
        show(err instanceof Error ? err.message : "Impresora no disponible", { type: "error" });
    } finally {
      if (mountedRef.current)
        setPrintingIds(prev => { const s = new Set(prev); s.delete(saleId); return s; });
    }
  };

  const handleEmail = async (p: Preset) => {
    setEmailingPreset(p);
    try {
      const { from: f, to: t } = presetRange(p);
      await apiRequest("/reports/sales/email", {
        method: "POST",
        body: JSON.stringify({ from: f, to: t, format: reportFormat, label: p }),
      });
      if (mountedRef.current) show(`Reporte ${p} enviado por correo`, { type: "success" });
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al enviar el reporte", { type: "error" });
    } finally {
      if (mountedRef.current) setEmailingPreset(null);
    }
  };

  /* ── Derived chart data ─────────────────────────────────── */

  /* Count days in range — needed to pick label format */
  const dayCount = useMemo(() => {
    const ms = new Date(to).getTime() - new Date(from).getTime();
    return Math.max(Math.round(ms / 86_400_000) + 1, 1);
  }, [from, to]);

  /* Sales per day — fill ALL days in range even if 0 */
  const salesByDay = useMemo<BarPoint[]>(() => {
    const map = new Map<string, number>();
    sales.forEach(s => {
      if (!s.date) return;
      map.set(s.date, (map.get(s.date) ?? 0) + s.total);
    });

    /* Enumerate every day from `from` to `to` */
    const points: BarPoint[] = [];
    const cursor = new Date(from + "T12:00:00");
    const end    = new Date(to   + "T12:00:00");
    while (cursor <= end) {
      const key = fmtDate(cursor);
      points.push({ label: dayLabel(key, dayCount), value: map.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return points;
  }, [sales, from, to, dayCount]);

  /* Sales per seller */
  const salesBySeller = useMemo<BarPoint[]>(() => {
    const map = new Map<string, number>();
    sales.forEach(s => {
      if (!s.seller || s.seller === "N/A") return;
      map.set(s.seller, (map.get(s.seller) ?? 0) + s.total);
    });
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);   /* top 8 sellers */
  }, [sales]);

  /* Sales per product — from top_product we only have 1; skip if no data */
  const hasCharts = salesByDay.some(d => d.value > 0);

  /* ── KPI cards ──────────────────────────────────────────── */

  const kpiCards: Array<{ label: string; value: string; variant?: string }> = kpi ? [
    { label: "Total ventas",       value: fmt(kpi.total_sales),      variant: "highlight" },
    { label: "Ticket promedio",    value: fmt(kpi.avg_ticket) },
    { label: "Ganancia",           value: fmt(kpi.total_profit),     variant: "profit" },
    { label: "Propinas",           value: fmt(kpi.total_tips) },
    { label: "Valor inventario",   value: fmt(kpi.inventory_value) },
    { label: "Productos críticos", value: String(kpi.critical_products), variant: kpi.critical_products > 0 ? "danger" : "" },
  ] : [];

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>

      {/* Header */}
      <div className="av-header">
        <h2 className="av-title">Reportes</h2>
        {loading && <Spinner size="sm" />}
      </div>

      <div className="dash-content">

        {/* ── Filters ───────────────────────────────── */}
        <div className="dash-filters">
          {(["diario", "semanal", "mensual"] as Preset[]).map(p => (
            <button
              key={p}
              className={`dash-preset-chip${preset === p ? " dash-preset-chip--active" : ""}`}
              onClick={() => applyPreset(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          <input type="date" className="dash-date-input" value={from}
            onChange={e => { setPreset("diario"); setFrom(e.target.value); }} />
          <span style={{ color: "var(--text-3)", fontWeight: 600 }}>→</span>
          <input type="date" className="dash-date-input" value={to}
            onChange={e => { setPreset("diario"); setTo(e.target.value); }} />
          <Button variant="secondary" size="md" loading={loading}
            onClick={() => void load(from, to)}>
            Filtrar
          </Button>
          <Button variant="secondary" size="md" loading={printLoading}
            onClick={() => void handlePrintRange()}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <PrintIcon />
              <span>{from === to ? `Imprimir día` : `Imprimir rango (${dayCount}d)`}</span>
            </span>
          </Button>
        </div>

        {/* ── Report actions ────────────────────────── */}
        <div className="dash-report-section">
          <div className="dash-report-header">
            <span className="dash-report-title">Generar reportes</span>
            <select
              className="dash-format-select"
              value={reportFormat}
              onChange={e => setReportFormat(e.target.value as "excel" | "pdf")}
            >
              <option value="excel">Excel</option>
              <option value="pdf">PDF</option>
            </select>
          </div>

          <div className="dash-report-row">
            <span className="dash-report-row-label"><DownloadIcon /> Descargar</span>
            {(["diario", "semanal", "mensual"] as Preset[]).map(p => (
              <Button
                key={p}
                variant="secondary"
                size="md"
                loading={downloadingPreset === p}
                disabled={downloadingPreset !== null || emailingPreset !== null}
                onClick={() => void handleDownload(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Button>
            ))}
          </div>

          <div className="dash-report-row">
            <span className="dash-report-row-label"><EmailIcon /> Enviar email</span>
            {(["diario", "semanal", "mensual"] as Preset[]).map(p => (
              <Button
                key={p}
                variant="secondary"
                size="md"
                loading={emailingPreset === p}
                disabled={downloadingPreset !== null || emailingPreset !== null}
                onClick={() => void handleEmail(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* ── KPI grid ──────────────────────────────── */}
        {kpi && (
          <div className="dash-kpi-grid">
            {kpiCards.map(card => (
              <div
                key={card.label}
                className={`dash-kpi-card${card.variant ? ` dash-kpi-card--${card.variant}` : ""}`}
              >
                <span className="dash-kpi-label">{card.label}</span>
                <span className="dash-kpi-value">{card.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Stock alerts ──────────────────────────── */}
        {stockAlerts.length > 0 && kpi && (
          <div>
            <div className="dash-section-title">Alertas de stock</div>
            <div className="dash-stock-grid">
              {stockAlerts.map((p, i) => {
                const critThresh = kpi.critical_stock_threshold ?? 5;
                const isCrit = p.stock <= critThresh;
                return (
                  <div
                    key={i}
                    className={`dash-stock-card${isCrit ? " dash-stock-card--crit" : " dash-stock-card--low"}`}
                  >
                    <span className="dash-stock-card-name" title={p.name}>{p.name}</span>
                    <span className="dash-stock-card-cat">{p.category}</span>
                    <span className="dash-stock-card-qty">{p.stock}</span>
                    <span className="dash-stock-card-badge">{isCrit ? "Crítico" : "Bajo"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Top stats ─────────────────────────────── */}
        {kpi && (kpi.top_product || kpi.top_seller) && (
          <div className="dash-kpi-grid">
            {kpi.top_product && (
              <div className="dash-kpi-card">
                <span className="dash-kpi-label">Producto estrella</span>
                <span className="dash-kpi-value" style={{ fontSize: 16 }}>
                  {kpi.top_product.name}
                </span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  {kpi.top_product.units} unidades
                </span>
              </div>
            )}
            {kpi.top_seller && (
              <div className="dash-kpi-card">
                <span className="dash-kpi-label">Mejor vendedor</span>
                <span className="dash-kpi-value" style={{ fontSize: 16 }}>
                  {kpi.top_seller.name}
                </span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  {fmt(kpi.top_seller.total_sold)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Charts ────────────────────────────────── */}
        {hasCharts && (
          <div className="dash-charts-grid">
            {/* Ventas por día */}
            {salesByDay.length > 1 && (
              <BarChart
                data={salesByDay}
                title="Ventas por día"
                formatValue={fmtShort}
              />
            )}

            {/* Ventas por vendedor */}
            {salesBySeller.length > 1 && (
              <HBarChart
                data={salesBySeller}
                title="Ventas por vendedor"
                formatValue={fmtShort}
              />
            )}
          </div>
        )}

        {/* ── Sales table ───────────────────────────── */}
        {sales.length > 0 && (
          <div>
            <div className="dash-section-title">Detalle de ventas</div>
            <div className="dash-sales-wrap">
              <div className="dash-sales-row dash-sales-header">
                <span className="dash-sales-id">#</span>
                <span className="dash-sales-seller">Vendedor</span>
                <span className="dash-sales-date">Fecha</span>
                <span className="dash-sales-total">Total</span>
                <span className="dash-sales-print-col" />
              </div>
              {sales.map(s => (
                <div key={s.id} className="dash-sales-row">
                  <span className="dash-sales-id">{s.id}</span>
                  <span className="dash-sales-seller">{s.seller}</span>
                  <span className="dash-sales-date">{s.date}</span>
                  <span className="dash-sales-total">{fmt(s.total)}</span>
                  <button
                    className="dash-sales-print-btn"
                    title="Imprimir recibo"
                    disabled={printingIds.has(s.id)}
                    onClick={() => void handlePrintSale(s.id)}
                  >
                    {printingIds.has(s.id)
                      ? <span className="dash-sales-print-spinner" />
                      : <PrintIcon />
                    }
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && !kpi && (
          <div className="al-stub">
            <div className="al-stub-icon">📊</div>
            <div className="al-stub-title">Sin datos</div>
            <p className="al-stub-desc">No hay ventas en el período seleccionado.</p>
          </div>
        )}

      </div>
    </div>
  );
}
