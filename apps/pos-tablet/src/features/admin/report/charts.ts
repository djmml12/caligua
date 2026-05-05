/**
 * Helpers para dibujar gráficas vectoriales en jsPDF.
 * Usa primitivas (rect, line, ellipse) — sin imágenes raster.
 */

import type jsPDF from "jspdf";
import { T, SERIES_HEX, hexToRgb } from "./theme";

interface XY { x: number; y: number; w: number; h: number; }

export interface Point { label: string; value: number; color?: string; }

// ─── Bar chart vertical ──────────────────────────────────────────────────────

export function drawBarChart(
  doc: jsPDF,
  data: Point[],
  box: XY,
  opts: { showLabels?: boolean; formatValue?: (n: number) => string } = {},
) {
  const { x, y, w, h } = box;
  const showLabels = opts.showLabels ?? true;
  const fmt = opts.formatValue ?? ((n: number) => String(Math.round(n)));

  const padL = 6;
  const padR = 6;
  const padT = showLabels ? 18 : 8;
  const padB = showLabels ? 16 : 8;
  const chartX = x + padL;
  const chartY = y + padT;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  // Fondo
  doc.setFillColor(...hexToRgb(T.GRAY_LIGHT));
  doc.rect(chartX, chartY, chartW, chartH, "F");

  if (data.length === 0) return;
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  // Grilla horizontal
  doc.setDrawColor(...hexToRgb(T.GRAY_MID));
  doc.setLineWidth(0.2);
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + (chartH / 4) * i;
    doc.line(chartX, gy, chartX + chartW, gy);
  }

  // Eje base
  doc.setDrawColor(...hexToRgb(T.BLACK));
  doc.setLineWidth(0.5);
  doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);

  const slot = chartW / data.length;
  const barW = Math.max(2, slot * 0.65);

  data.forEach((d, i) => {
    const ratio = d.value / maxVal;
    const bh = Math.max(0.3, ratio * chartH);
    const bx = chartX + slot * i + (slot - barW) / 2;
    const by = chartY + chartH - bh;
    const color = d.color ?? SERIES_HEX[i % SERIES_HEX.length];

    doc.setFillColor(...hexToRgb(color));
    doc.rect(bx, by, barW, bh, "F");

    // Label valor encima
    if (showLabels && d.value > 0) {
      doc.setFontSize(6.5);
      doc.setTextColor(...hexToRgb(T.GRAY_DARK));
      doc.text(fmt(d.value), bx + barW / 2, by - 1.5, { align: "center" });
    }

    // Label X abajo
    if (showLabels && d.label) {
      doc.setFontSize(6.5);
      doc.setTextColor(...hexToRgb(T.GRAY_TEXT));
      doc.text(d.label, bx + barW / 2, chartY + chartH + 5, { align: "center" });
    }
  });
}

// ─── Bar chart horizontal ────────────────────────────────────────────────────

export function drawHBarChart(
  doc: jsPDF,
  data: Point[],
  box: XY,
  opts: { formatValue?: (n: number) => string } = {},
) {
  const { x, y, w, h } = box;
  const fmt = opts.formatValue ?? ((n: number) => String(Math.round(n)));
  const labelW = 80;
  const valueW = 50;
  const padT = 4;
  const padB = 4;

  const chartX = x + labelW;
  const chartY = y + padT;
  const chartW = w - labelW - valueW - 4;
  const chartH = h - padT - padB;

  if (data.length === 0) return;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const slot = chartH / data.length;
  const barH = Math.max(2, slot * 0.65);

  data.forEach((d, i) => {
    const by = chartY + slot * i + (slot - barH) / 2;
    const ratio = d.value / maxVal;
    const bw = Math.max(0.3, ratio * chartW);
    const color = d.color ?? SERIES_HEX[i % SERIES_HEX.length];

    // Label izquierda
    doc.setFontSize(8);
    doc.setTextColor(...hexToRgb(T.GRAY_DARK));
    const label = d.label.length > 22 ? d.label.slice(0, 21) + "…" : d.label;
    doc.text(label, x + labelW - 4, by + barH / 2 + 1.5, { align: "right" });

    // Track gris
    doc.setFillColor(...hexToRgb(T.GRAY_LIGHT));
    doc.rect(chartX, by, chartW, barH, "F");

    // Barra
    doc.setFillColor(...hexToRgb(color));
    doc.rect(chartX, by, bw, barH, "F");

    // Valor derecha
    doc.setFontSize(7.5);
    doc.setTextColor(...hexToRgb(T.GRAY_DARK));
    doc.text(fmt(d.value), chartX + chartW + 2, by + barH / 2 + 1.5);
  });
}

// ─── Pie / Donut ─────────────────────────────────────────────────────────────

export function drawPieChart(
  doc: jsPDF,
  data: Point[],
  box: XY,
  opts: { donut?: boolean; innerRatio?: number } = {},
) {
  const { x, y, w, h } = box;
  const donut = opts.donut ?? true;
  const innerRatio = opts.innerRatio ?? 0.5;

  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2 - 2;
  const ri = donut ? r * innerRatio : 0;

  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  if (total <= 0) return;

  // jsPDF no tiene arc fill nativo. Aproximamos rebanadas con triángulos finos.
  let cum = -Math.PI / 2;
  data.forEach((d, i) => {
    const angle = (Math.max(0, d.value) / total) * 2 * Math.PI;
    if (angle <= 0) return;
    const color = d.color ?? SERIES_HEX[i % SERIES_HEX.length];
    doc.setFillColor(...hexToRgb(color));
    doc.setDrawColor(...hexToRgb(color));

    // Subdividir el arco en triángulos finos para simular el sector
    const steps = Math.max(6, Math.ceil(angle / (Math.PI / 36)));
    for (let s = 0; s < steps; s++) {
      const a1 = cum + (angle * s) / steps;
      const a2 = cum + (angle * (s + 1)) / steps;
      const x1 = cx + Math.cos(a1) * r;
      const y1 = cy + Math.sin(a1) * r;
      const x2 = cx + Math.cos(a2) * r;
      const y2 = cy + Math.sin(a2) * r;
      // triángulo (cx,cy)-(x1,y1)-(x2,y2)
      doc.triangle(cx, cy, x1, y1, x2, y2, "F");
    }
    cum += angle;
  });

  // Donut: agujero blanco al centro
  if (donut && ri > 0) {
    doc.setFillColor(255, 255, 255);
    doc.ellipse(cx, cy, ri, ri, "F");
  }
}

// ─── Line chart ──────────────────────────────────────────────────────────────

export function drawLineChart(
  doc: jsPDF,
  data: Point[],
  box: XY,
  opts: { formatValue?: (n: number) => string; color?: string } = {},
) {
  const { x, y, w, h } = box;
  const color = opts.color ?? T.RED;
  const fmt = opts.formatValue ?? ((n: number) => String(Math.round(n)));

  const padL = 8;
  const padR = 8;
  const padT = 14;
  const padB = 14;
  const chartX = x + padL;
  const chartY = y + padT;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  // Fondo
  doc.setFillColor(...hexToRgb(T.GRAY_LIGHT));
  doc.rect(chartX, chartY, chartW, chartH, "F");

  if (data.length === 0) return;
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  // Grilla
  doc.setDrawColor(...hexToRgb(T.GRAY_MID));
  doc.setLineWidth(0.2);
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + (chartH / 4) * i;
    doc.line(chartX, gy, chartX + chartW, gy);
  }

  if (data.length < 2) return;

  // Puntos
  const pts = data.map((d, i) => ({
    x: chartX + (i / (data.length - 1)) * chartW,
    y: chartY + chartH - (d.value / maxVal) * chartH,
  }));

  // Línea
  doc.setDrawColor(...hexToRgb(color));
  doc.setLineWidth(0.8);
  for (let i = 0; i < pts.length - 1; i++) {
    doc.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
  }

  // Marcadores
  doc.setFillColor(...hexToRgb(color));
  pts.forEach((p, i) => {
    doc.ellipse(p.x, p.y, 1.4, 1.4, "F");
    if (data[i].value > 0 && data.length <= 14) {
      doc.setFontSize(6.5);
      doc.setTextColor(...hexToRgb(T.GRAY_DARK));
      doc.text(fmt(data[i].value), p.x, p.y - 2.5, { align: "center" });
    }
  });

  // Labels X
  data.forEach((d, i) => {
    if (!d.label) return;
    if (data.length > 14 && i % 2 !== 0) return;
    doc.setFontSize(6.5);
    doc.setTextColor(...hexToRgb(T.GRAY_TEXT));
    doc.text(d.label, pts[i].x, chartY + chartH + 5, { align: "center" });
  });
}
