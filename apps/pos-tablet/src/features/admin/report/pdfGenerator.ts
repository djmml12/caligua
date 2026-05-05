/**
 * pdfGenerator.ts — Genera reportes PDF Caligua en el cliente con jsPDF.
 *
 * Diseño: encabezado negro + rojo + dorado, KPI cards con acento de color,
 * gráficas vectoriales (barras, donut, línea), tabla de detalle.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { T, SERIES_HEX, hexToRgb, fmtQ } from "./theme";
import {
  drawBarChart,
  drawHBarChart,
  drawPieChart,
  drawLineChart,
  type Point,
} from "./charts";

export interface SaleRow {
  id:     number;
  seller: string;
  total:  number;
  tip:    number;
  date:   string;
}

export interface KPIData {
  total_sales:   number;
  avg_ticket:    number;
  total_profit:  number;
  total_tips:    number;
  top_product:   { name: string; units: number } | null;
  top_seller:    { name: string; total_sold: number } | null;
}

export interface RangeReportInput {
  label:         "diario" | "semanal" | "mensual";
  from:          string;
  to:            string;
  kpi:           KPIData;
  sales:         SaleRow[];
  salesByDay:    Point[];
  salesBySeller: Point[];
  topProducts?:  Point[];
}

// ─── Encabezado branding Caligua ─────────────────────────────────────────────

function drawHeader(doc: jsPDF, subtitle: string, dateStr: string) {
  const w = doc.internal.pageSize.getWidth();

  // Banda negra
  doc.setFillColor(...hexToRgb(T.BLACK));
  doc.rect(0, 0, w, 18, "F");
  // Línea roja
  doc.setFillColor(...hexToRgb(T.RED));
  doc.rect(0, 18, w, 1.2, "F");

  // Logo textual
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...hexToRgb(T.RED));
  doc.text("CALIGUA", 10, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...hexToRgb(T.GOLD));
  doc.text("Restaurant BBQ & Grill", 10, 15);

  // Título del reporte (derecha)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...hexToRgb(T.WHITE));
  doc.text(subtitle, w - 10, 9, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...hexToRgb(T.GRAY_MID));
  doc.text(dateStr, w - 10, 14, { align: "right" });
}

// ─── KPI Cards (4 columnas en una fila) ──────────────────────────────────────

interface KPICard {
  label: string; value: string;
  bg: string; fg: string; accent: string;
}

function drawKPIRow(doc: jsPDF, cards: KPICard[], y: number, marginX = 10): number {
  const w = doc.internal.pageSize.getWidth();
  const gap = 4;
  const cw = (w - marginX * 2 - gap * (cards.length - 1)) / cards.length;
  const ch = 22;

  cards.forEach((c, i) => {
    const x = marginX + i * (cw + gap);
    // Sombra
    doc.setFillColor(0, 0, 0);
    doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
    doc.roundedRect(x + 0.6, y + 0.6, cw, ch, 2, 2, "F");
    doc.setGState(new (doc as any).GState({ opacity: 1 }));

    // Fondo
    doc.setFillColor(...hexToRgb(c.bg));
    doc.roundedRect(x, y, cw, ch, 2, 2, "F");

    // Acento izquierdo
    doc.setFillColor(...hexToRgb(c.accent));
    doc.rect(x, y, 1.6, ch, "F");

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...hexToRgb(T.GRAY_TEXT));
    doc.text(c.label.toUpperCase(), x + 4, y + 6);

    // Valor
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...hexToRgb(c.fg));
    doc.text(c.value, x + 4, y + 14);
  });

  return y + ch + 3;
}

// ─── Banda de título de sección ──────────────────────────────────────────────

function drawSectionTitle(doc: jsPDF, title: string, y: number, marginX = 10): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...hexToRgb(T.RED));
  doc.setGState(new (doc as any).GState({ opacity: 0.13 }));
  doc.rect(marginX, y, w - marginX * 2, 7, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...hexToRgb(T.RED_DARK));
  doc.text(title.toUpperCase(), marginX + 3, y + 5);

  return y + 10;
}

// ─── Pie de página con paginación ────────────────────────────────────────────

function drawFooter(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...hexToRgb(T.GRAY_TEXT));
    doc.text("* Las propinas son una cuenta aparte y no se incluyen en las utilidades.",
      w / 2, h - 6, { align: "center" });
    doc.text(`Página ${i} de ${total}`, w - 10, h - 6, { align: "right" });
    doc.text("Generado por Caligua POS", 10, h - 6);
  }
}

// ─── Reporte de RANGO (diario / semanal / mensual) ───────────────────────────

export function generateRangeReportPDF(input: RangeReportInput): jsPDF {
  const { label, from, to, kpi, sales, salesByDay, salesBySeller, topProducts = [] } = input;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const labelCap = label.charAt(0).toUpperCase() + label.slice(1);
  drawHeader(doc, `Reporte ${labelCap}`, `${from}  →  ${to}`);

  let y = 24;

  // KPI Cards
  const totalCobrado = kpi.total_sales + kpi.total_tips;
  y = drawKPIRow(doc, [
    { label: "Ventas",    value: String(sales.length),     bg: T.GRAY_LIGHT, fg: T.BLACK,   accent: T.BLACK   },
    { label: "Vendido",   value: fmtQ(kpi.total_sales),    bg: T.DANGER_BG,  fg: T.DANGER,  accent: T.RED     },
    { label: "Propinas",  value: fmtQ(kpi.total_tips),     bg: T.WARNING_BG, fg: T.WARNING, accent: T.GOLD    },
    { label: "Cobrado",   value: fmtQ(totalCobrado),       bg: T.BLACK,      fg: T.GOLD,    accent: T.RED     },
  ], y);

  // Tendencia ventas por día (línea full-width)
  if (salesByDay.length > 1) {
    y = drawSectionTitle(doc, "Tendencia de ventas por día", y);
    drawLineChart(doc, salesByDay, { x: 10, y, w: 190, h: 50 }, { formatValue: (n) => `Q${Math.round(n)}` });
    y += 53;
  } else if (salesByDay.length === 1) {
    y = drawSectionTitle(doc, "Ventas del día", y);
    drawBarChart(doc, salesByDay, { x: 10, y, w: 190, h: 50 }, { formatValue: (n) => `Q${Math.round(n)}` });
    y += 53;
  }

  // Vendedores + Top productos (lado a lado)
  const hasSellers = salesBySeller.length > 0;
  const hasTopProds = topProducts.length > 0;

  if (hasSellers || hasTopProds) {
    y = drawSectionTitle(doc, hasTopProds && hasSellers ? "Top vendedores y productos" : (hasSellers ? "Top vendedores" : "Top productos"), y);

    if (hasSellers && hasTopProds) {
      const sellH = Math.max(40, salesBySeller.slice(0, 6).length * 7 + 8);
      const prodH = sellH;
      drawHBarChart(doc, salesBySeller.slice(0, 6),
        { x: 10, y, w: 95, h: sellH },
        { formatValue: (n) => `Q${Math.round(n)}` }
      );
      // Donut top productos
      drawPieChart(doc, topProducts.slice(0, 6),
        { x: 110, y, w: 40, h: prodH }
      );
      // Leyenda donut
      let ly = y + 4;
      topProducts.slice(0, 6).forEach((p, i) => {
        const hex = SERIES_HEX[i % SERIES_HEX.length];
        doc.setFillColor(...hexToRgb(hex));
        doc.rect(155, ly, 3, 3, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...hexToRgb(T.GRAY_DARK));
        const lbl = p.label.length > 22 ? p.label.slice(0, 21) + "…" : p.label;
        doc.text(`${lbl}`, 159, ly + 2.5);
        ly += 5;
      });
      y += sellH + 4;
    } else if (hasSellers) {
      const h = Math.max(40, salesBySeller.slice(0, 8).length * 8 + 8);
      drawHBarChart(doc, salesBySeller.slice(0, 8),
        { x: 10, y, w: 190, h },
        { formatValue: (n) => `Q${Math.round(n)}` }
      );
      y += h + 4;
    } else if (hasTopProds) {
      const h = 50;
      drawPieChart(doc, topProducts.slice(0, 6),
        { x: 10, y, w: h, h }
      );
      let ly = y + 4;
      topProducts.slice(0, 6).forEach((p, i) => {
        const hex = SERIES_HEX[i % SERIES_HEX.length];
        doc.setFillColor(...hexToRgb(hex));
        doc.rect(70, ly, 3, 3, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...hexToRgb(T.GRAY_DARK));
        doc.text(`${p.label} — ${Math.round(p.value)}`, 75, ly + 2.5);
        ly += 6;
      });
      y += h + 4;
    }
  }

  // Productos estrella
  if (kpi.top_product || kpi.top_seller) {
    y = drawSectionTitle(doc, "Estrellas del período", y);
    const cards: KPICard[] = [];
    if (kpi.top_product) cards.push({
      label: "Producto estrella",
      value: `${kpi.top_product.name} (${kpi.top_product.units}u)`,
      bg: T.GRAY_LIGHT, fg: T.BLACK, accent: T.GOLD,
    });
    if (kpi.top_seller) cards.push({
      label: "Mejor vendedor",
      value: `${kpi.top_seller.name} — ${fmtQ(kpi.top_seller.total_sold)}`,
      bg: T.GRAY_LIGHT, fg: T.BLACK, accent: T.RED,
    });
    y = drawKPIRow(doc, cards, y);
  }

  // Tabla detalle
  y = drawSectionTitle(doc, "Detalle de ventas", y);

  if (sales.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...hexToRgb(T.GRAY_TEXT));
    doc.text("No hay ventas en el rango seleccionado.", 10, y + 4);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["#", "Vendedor", "Fecha", "Propina", "Total"]],
      body: sales.map((s) => [
        `#${s.id}`,
        s.seller || "N/A",
        s.date,
        fmtQ(s.tip),
        fmtQ(s.total),
      ]),
      foot: [[
        "",
        "TOTAL",
        "",
        fmtQ(sales.reduce((a, s) => a + s.tip, 0)),
        fmtQ(sales.reduce((a, s) => a + s.total, 0)),
      ]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 1.8 },
      headStyles: {
        fillColor: hexToRgb(T.BLACK),
        textColor: hexToRgb(T.WHITE),
        fontStyle: "bold",
      },
      footStyles: {
        fillColor: hexToRgb(T.GRAY_MID),
        textColor: hexToRgb(T.BLACK),
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: hexToRgb(T.GRAY_LIGHT) },
      columnStyles: {
        0: { cellWidth: 18, halign: "center" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
      margin: { left: 10, right: 10 },
    });
  }

  drawFooter(doc);
  return doc;
}
