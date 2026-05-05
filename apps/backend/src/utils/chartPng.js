/**
 * chartPng.js — generador de gráficas PNG usando pngjs puro (sin canvas, sin deps extra).
 *
 * Exporta:
 *   barChartPng(data, opts)  → Buffer PNG (barras verticales)
 *   hBarChartPng(data, opts) → Buffer PNG (barras horizontales)
 *   pieChartPng(data, opts)  → Buffer PNG (donut / pie)
 *   lineChartPng(data, opts) → Buffer PNG (línea de tendencia)
 *
 * data = [{ label?, value, color? }]
 * color es [r, g, b] — si se omite se usa SERIES_RGB rotativo.
 */

import { PNG } from "pngjs";
import { SERIES_RGB } from "./reportTheme.js";

// ── Primitivas de píxel ───────────────────────────────────────────────────────

function setPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (y * png.width + x) * 4;
  png.data[idx]     = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function fillRect(png, x, y, w, h, [r, g, b, a = 255]) {
  const x1 = Math.max(0, Math.round(x));
  const y1 = Math.max(0, Math.round(y));
  const x2 = Math.min(png.width,  Math.round(x + w));
  const y2 = Math.min(png.height, Math.round(y + h));
  for (let py = y1; py < y2; py++) {
    for (let px = x1; px < x2; px++) {
      const idx = (py * png.width + px) * 4;
      png.data[idx]     = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
}

// Línea Bresenham con grosor
function drawLine(png, x0, y0, x1, y1, color, thickness = 1) {
  const [r, g, b, a = 255] = color;
  const t = Math.max(0, Math.floor(thickness / 2));
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    for (let ty = -t; ty <= t; ty++) {
      for (let tx = -t; tx <= t; tx++) {
        setPixel(png, x0 + tx, y0 + ty, r, g, b, a);
      }
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 <  dx) { err += dx; y0 += sy; }
  }
}

function makePng(w, h) {
  const png = new PNG({ width: w, height: h, filterType: -1 });
  png.data.fill(255);
  return png;
}

// ── Barra vertical ────────────────────────────────────────────────────────────

/**
 * @param {Array<{value:number, label?:string, color?:[r,g,b]}>} data
 */
export function barChartPng(data, opts = {}) {
  const W    = opts.width  ?? 560;
  const H    = opts.height ?? 260;
  const padL = opts.padL   ?? 10;
  const padR = opts.padR   ?? 10;
  const padT = opts.padT   ?? 16;
  const padB = opts.padB   ?? 24;

  const png = makePng(W, H);
  if (!data.length) return PNG.sync.write(png);

  const maxVal   = Math.max(...data.map((d) => d.value), 1);
  const chartW   = W - padL - padR;
  const chartH   = H - padT - padB;
  const barSlot  = chartW / data.length;
  const barGap   = Math.max(2, Math.floor(barSlot * 0.18));
  const barW     = Math.max(2, Math.floor(barSlot - barGap * 2));

  // Fondo área gráfica ligeramente gris
  fillRect(png, padL, padT, chartW, chartH, [247, 247, 247, 255]);

  // Líneas de grilla horizontales
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + Math.round((chartH / gridLines) * i);
    fillRect(png, padL, y, chartW, 1, [210, 210, 210, 255]);
  }

  // Eje base
  fillRect(png, padL, padT + chartH, chartW, 2, [80, 80, 80, 255]);

  data.forEach((d, i) => {
    const barH  = Math.max(2, Math.round((d.value / maxVal) * chartH));
    const x     = padL + Math.round(i * barSlot + barGap);
    const y     = padT + chartH - barH;
    const color = d.color ?? SERIES_RGB[i % SERIES_RGB.length];

    // Sombra suave
    fillRect(png, x + 3, y + 3, barW, barH, [0, 0, 0, 40]);
    // Barra
    fillRect(png, x, y, barW, barH, [...color, 255]);
    // Brillo superior (tono más claro)
    const bright = color.map((c) => Math.min(255, c + 60));
    fillRect(png, x, y, barW, Math.min(6, barH), [...bright, 180]);

    // Marca de separación en eje
    fillRect(png, x + Math.floor(barW / 2), padT + chartH + 2, 1, 4, [100, 100, 100, 255]);
  });

  return PNG.sync.write(png);
}

// ── Barra horizontal ──────────────────────────────────────────────────────────

export function hBarChartPng(data, opts = {}) {
  const W    = opts.width  ?? 560;
  const H    = opts.height ?? Math.max(160, data.length * 44 + 30);
  const padL = opts.padL   ?? 12;
  const padR = opts.padR   ?? 16;
  const padT = opts.padT   ?? 16;
  const padB = opts.padB   ?? 16;

  const png = makePng(W, H);
  if (!data.length) return PNG.sync.write(png);

  const maxVal  = Math.max(...data.map((d) => d.value), 1);
  const chartW  = W - padL - padR;
  const chartH  = H - padT - padB;
  const barSlot = chartH / data.length;
  const barGap  = Math.max(2, Math.floor(barSlot * 0.22));
  const barH    = Math.max(2, Math.floor(barSlot - barGap * 2));

  fillRect(png, padL, padT, chartW, chartH, [247, 247, 247, 255]);

  // Líneas de grilla verticales
  for (let i = 0; i <= 4; i++) {
    const x = padL + Math.round((chartW / 4) * i);
    fillRect(png, x, padT, 1, chartH, [210, 210, 210, 255]);
  }

  // Eje izquierdo
  fillRect(png, padL, padT, 2, chartH, [80, 80, 80, 255]);

  data.forEach((d, i) => {
    const barW  = Math.max(2, Math.round((d.value / maxVal) * chartW));
    const x     = padL + 2;
    const y     = padT + Math.round(i * barSlot + barGap);
    const color = d.color ?? SERIES_RGB[i % SERIES_RGB.length];

    fillRect(png, x + 2, y + 2, barW, barH, [0, 0, 0, 35]);
    fillRect(png, x, y, barW, barH, [...color, 255]);
    const bright = color.map((c) => Math.min(255, c + 60));
    fillRect(png, x, y, barW, Math.min(4, barH), [...bright, 180]);
  });

  return PNG.sync.write(png);
}

// ── Donut / Pie ───────────────────────────────────────────────────────────────

export function pieChartPng(data, opts = {}) {
  const W          = opts.width      ?? 280;
  const H          = opts.height     ?? 280;
  const donut      = opts.donut      ?? true;
  const innerRatio = opts.innerRatio ?? 0.48;

  const png = makePng(W, H);

  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  if (total === 0) return PNG.sync.write(png);

  const cx     = W / 2;
  const cy     = H / 2;
  const outer  = Math.min(W, H) / 2 - 4;
  const inner  = donut ? outer * innerRatio : 0;
  const outer2 = outer * outer;
  const inner2 = inner * inner;

  // Ángulos acumulados desde -π/2 (12 en punto)
  const START = -Math.PI / 2;
  let cum = START;
  const sectors = data.map((d, i) => {
    const sa = cum;
    cum += (Math.max(0, d.value) / total) * 2 * Math.PI;
    return { sa, ea: cum, color: d.color ?? SERIES_RGB[i % SERIES_RGB.length] };
  });

  // Normaliza angle al rango [START, START + 2π)
  const norm = (a) => {
    while (a < START)           a += 2 * Math.PI;
    while (a >= START + 2 * Math.PI) a -= 2 * Math.PI;
    return a;
  };

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const dx   = px - cx;
      const dy   = py - cy;
      const dist2 = dx * dx + dy * dy;

      if (dist2 > outer2 || dist2 < inner2) continue;

      const angle = norm(Math.atan2(dy, dx));

      for (const s of sectors) {
        if (angle >= s.sa && angle < s.ea) {
          setPixel(png, px, py, s.color[0], s.color[1], s.color[2]);
          break;
        }
      }
    }
  }

  // Borde externo
  for (let px = 0; px < W; px++) {
    for (let py = 0; py < H; py++) {
      const dx    = px - cx;
      const dy    = py - cy;
      const dist  = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(dist - outer) < 1.5) setPixel(png, px, py, 255, 255, 255, 120);
      if (donut && Math.abs(dist - inner) < 1.5) setPixel(png, px, py, 255, 255, 255, 160);
    }
  }

  return PNG.sync.write(png);
}

// ── Línea de tendencia ────────────────────────────────────────────────────────

export function lineChartPng(data, opts = {}) {
  if (data.length < 2) return barChartPng(data, opts);

  const W    = opts.width   ?? 560;
  const H    = opts.height  ?? 220;
  const padL = opts.padL    ?? 12;
  const padR = opts.padR    ?? 12;
  const padT = opts.padT    ?? 16;
  const padB = opts.padB    ?? 24;
  const lineColor = opts.color ?? SERIES_RGB[0];

  const png = makePng(W, H);

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  fillRect(png, padL, padT, chartW, chartH, [247, 247, 247, 255]);

  for (let i = 0; i <= 4; i++) {
    const y = padT + Math.round((chartH / 4) * i);
    fillRect(png, padL, y, chartW, 1, [210, 210, 210, 255]);
  }

  fillRect(png, padL, padT + chartH, chartW, 2, [80, 80, 80, 255]);

  // Área de relleno bajo la línea (semitransparente)
  const points = data.map((d, i) => ({
    x: padL + Math.round((i / (data.length - 1)) * chartW),
    y: padT + chartH - Math.max(0, Math.round((d.value / maxVal) * chartH)),
  }));

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const steps = Math.abs(p2.x - p1.x);
    for (let s = 0; s <= steps; s++) {
      const t  = steps === 0 ? 0 : s / steps;
      const cx = Math.round(p1.x + t * (p2.x - p1.x));
      const cy = Math.round(p1.y + t * (p2.y - p1.y));
      fillRect(png, cx, cy, 1, padT + chartH - cy, [...lineColor, 50]);
    }
  }

  // Línea principal
  for (let i = 0; i < points.length - 1; i++) {
    drawLine(png, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, [...lineColor, 255], 2);
  }

  // Puntos
  for (const pt of points) {
    fillRect(png, pt.x - 4, pt.y - 4, 9, 9, [255, 255, 255, 255]);
    fillRect(png, pt.x - 3, pt.y - 3, 7, 7, [...lineColor, 255]);
  }

  return PNG.sync.write(png);
}
