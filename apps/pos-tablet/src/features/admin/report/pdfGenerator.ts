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

// ─── Encabezado limpio ───────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, subtitle: string, dateStr: string) {
  const w = doc.internal.pageSize.getWidth();

  // Nombre empresa
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...hexToRgb(T.RED));
  doc.text("CALIGUA", 10, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...hexToRgb(T.GRAY_TEXT));
  doc.text("Restaurant BBQ & Grill", 10, 17);

  // Título (derecha)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...hexToRgb(T.GRAY_DARK));
  doc.text(subtitle, w - 10, 11, { align: "right" });

  // Fecha (centro)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...hexToRgb(T.GRAY_TEXT));
  doc.text(dateStr, w / 2, 16, { align: "center" });

  // Línea separadora roja
  doc.setDrawColor(...hexToRgb(T.RED));
  doc.setLineWidth(0.5);
  doc.line(10, 20, w - 10, 20);
}

// ─── KPI como filas de texto, sin fondos ─────────────────────────────────────

interface KPIItem { label: string; value: string; }

function drawKPIRow(doc: jsPDF, items: KPIItem[], y: number, marginX = 10): number {
  const w     = doc.internal.pageSize.getWidth();
  const colW  = (w - marginX * 2) / items.length;

  items.forEach((item, i) => {
    const x = marginX + i * colW;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...hexToRgb(T.GRAY_TEXT));
    doc.text(item.label.toUpperCase(), x + colW / 2, y, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...hexToRgb(T.GRAY_DARK));
    doc.text(item.value, x + colW / 2, y + 7, { align: "center" });

    // Separador vertical entre columnas
    if (i > 0) {
      doc.setDrawColor(...hexToRgb(T.GRAY_MID));
      doc.setLineWidth(0.3);
      doc.line(x, y - 3, x, y + 9);
    }
  });

  // Línea inferior
  doc.setDrawColor(...hexToRgb(T.GRAY_MID));
  doc.setLineWidth(0.3);
  doc.line(marginX, y + 11, w - marginX, y + 11);

  return y + 15;
}

// ─── Título de sección: solo texto + línea ────────────────────────────────────

function drawSectionTitle(doc: jsPDF, title: string, y: number, marginX = 10): number {
  const w = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...hexToRgb(T.RED_DARK));
  doc.text(title.toUpperCase(), marginX, y + 4);

  doc.setDrawColor(...hexToRgb(T.GRAY_MID));
  doc.setLineWidth(0.3);
  doc.line(marginX, y + 6, w - marginX, y + 6);

  return y + 10;
}

// ─── Pie de página ───────────────────────────────────────────────────────────

function drawFooter(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);

    doc.setDrawColor(...hexToRgb(T.GRAY_MID));
    doc.setLineWidth(0.3);
    doc.line(10, h - 10, w - 10, h - 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...hexToRgb(T.GRAY_TEXT));
    doc.text(
      "* Las propinas son una cuenta aparte y no se incluyen en las utilidades.",
      w / 2, h - 6, { align: "center" },
    );
    doc.text(`Página ${i} de ${total}`, w - 10, h - 6, { align: "right" });
    doc.text("Generado por Caligua POS", 10, h - 6);
  }
}

// ─── Reporte de RANGO (diario / semanal / mensual) ───────────────────────────

export function generateRangeReportPDF(input: RangeReportInput): jsPDF {
  const { label, from, to, kpi, sales, salesByDay, salesBySeller, topProducts = [] } = input;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const labelCap = label.charAt(0).toUpperCase() + label.slice(1);
  drawHeader(doc, `Reporte ${labelCap}`, `${from} / ${to}`);

  let y = 26;

  // KPI Row
  const totalCobrado = kpi.total_sales + kpi.total_tips;
  y = drawKPIRow(doc, [
    { label: "Ventas",   value: String(sales.length)  },
    { label: "Vendido",  value: fmtQ(kpi.total_sales) },
    { label: "Propinas", value: fmtQ(kpi.total_tips)  },
    { label: "Cobrado",  value: fmtQ(totalCobrado)    },
  ], y);

  // Gráfica de tendencia
  if (salesByDay.length > 1) {
    y = drawSectionTitle(doc, "Tendencia de ventas por día", y);
    drawLineChart(doc, salesByDay, { x: 10, y, w: 190, h: 50 }, { formatValue: (n) => `Q${Math.round(n)}` });
    y += 53;
  } else if (salesByDay.length === 1) {
    y = drawSectionTitle(doc, "Ventas del día", y);
    drawBarChart(doc, salesByDay, { x: 10, y, w: 190, h: 50 }, { formatValue: (n) => `Q${Math.round(n)}` });
    y += 53;
  }

  // Vendedores + Top productos
  const hasSellers  = salesBySeller.length > 0;
  const hasTopProds = topProducts.length > 0;

  if (hasSellers || hasTopProds) {
    y = drawSectionTitle(
      doc,
      hasTopProds && hasSellers ? "Top vendedores y productos" : hasSellers ? "Top vendedores" : "Top productos",
      y,
    );

    if (hasSellers && hasTopProds) {
      const sellH = Math.max(40, salesBySeller.slice(0, 6).length * 7 + 8);
      drawHBarChart(doc, salesBySeller.slice(0, 6),
        { x: 10, y, w: 95, h: sellH },
        { formatValue: (n) => `Q${Math.round(n)}` },
      );
      drawPieChart(doc, topProducts.slice(0, 6), { x: 110, y, w: 40, h: sellH });
      let ly = y + 4;
      topProducts.slice(0, 6).forEach((p, i) => {
        const hex = SERIES_HEX[i % SERIES_HEX.length];
        doc.setFillColor(...hexToRgb(hex));
        doc.rect(155, ly, 3, 3, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...hexToRgb(T.GRAY_DARK));
        doc.text(p.label.length > 22 ? p.label.slice(0, 21) + "…" : p.label, 159, ly + 2.5);
        ly += 5;
      });
      y += sellH + 4;
    } else if (hasSellers) {
      const h = Math.max(40, salesBySeller.slice(0, 8).length * 8 + 8);
      drawHBarChart(doc, salesBySeller.slice(0, 8),
        { x: 10, y, w: 190, h },
        { formatValue: (n) => `Q${Math.round(n)}` },
      );
      y += h + 4;
    } else if (hasTopProds) {
      const h = 50;
      drawPieChart(doc, topProducts.slice(0, 6), { x: 10, y, w: h, h });
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

  // Estrellas
  if (kpi.top_product || kpi.top_seller) {
    y = drawSectionTitle(doc, "Estrellas del período", y);
    const stars: KPIItem[] = [];
    if (kpi.top_product) stars.push({
      label: "Producto estrella",
      value: `${kpi.top_product.name} (${kpi.top_product.units} u)`,
    });
    if (kpi.top_seller) stars.push({
      label: "Mejor vendedor",
      value: `${kpi.top_seller.name} — ${fmtQ(kpi.top_seller.total_sold)}`,
    });
    y = drawKPIRow(doc, stars, y);
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
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 2,
        textColor: hexToRgb(T.GRAY_DARK),
        lineColor: hexToRgb(T.GRAY_MID),
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: false,
        textColor: hexToRgb(T.GRAY_TEXT),
        fontStyle: "bold",
        fontSize: 7,
        lineColor: hexToRgb(T.GRAY_DARK),
        lineWidth: 0.4,
      },
      footStyles: {
        fillColor: false,
        textColor: hexToRgb(T.GRAY_DARK),
        fontStyle: "bold",
        lineColor: hexToRgb(T.GRAY_DARK),
        lineWidth: 0.4,
      },
      alternateRowStyles: { fillColor: false },
      columnStyles: {
        0: { cellWidth: 18, halign: "center" },
        3: { halign: "right" },
        4: { halign: "right", fontStyle: "bold" },
      },
      margin: { left: 10, right: 10 },
    });
  }

  drawFooter(doc);
  return doc;
}
