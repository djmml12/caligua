import db from "../config/db.js";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";
import {
  getCashierRangeData,
  getDashboardSummaryService,
  getDailySalesSummaryService,
  getInventoryMetricsService,
  getSalesReport,
  getSalesByHourService,
  getSalesByDayService,
  getTopProductsService,
  getStockByCategoryService,
} from "../services/reports.service.js";
import { exportToExcel } from "../utils/exportExcel.js";
import { getSaleByIdService } from "../services/sales.service.js";
import { getEmailAlertConfigService } from "../services/email-alert.service.js";
import { T, SERIES_HEX, fmtQ } from "../utils/reportTheme.js";
import { barChartPng, hBarChartPng, pieChartPng, lineChartPng } from "../utils/chartPng.js";

// Timestamps are stored as TIMESTAMP (local time, no timezone).
// Cast directly to date — no AT TIME ZONE conversion needed.
const localSaleDateExpr        = `COALESCE(s.paid_at, s.created_at)::date`;
const localSaleDateExprNoAlias = `COALESCE(paid_at, created_at)::date`;
const localCanceledDateExpr    = `s.canceled_at::date`;
const dateBetween = (expr) => `${expr} BETWEEN ?::date AND ?::date`;

const todayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildDailySummaryEmailText = (summary) => {
  const salesLines = summary.sales.length
    ? summary.sales.map((sale) => {
        const tip = Number(sale.tip || 0);
        const base = `- Venta #${sale.monthly_number ?? sale.id}: Q ${Number(sale.total || 0).toFixed(2)}`;
        return tip > 0 ? `${base}  (propina: Q ${tip.toFixed(2)})` : base;
      })
    : ["- Sin ventas pagadas hoy"];

  return [
    `Resumen de ventas del día ${summary.date}`,
    "",
    "Ventas:",
    ...salesLines,
    "",
    `Total ventas: Q ${Number(summary.total_sales_amount || 0).toFixed(2)}`,
    `Total propinas: Q ${Number(summary.total_tips || 0).toFixed(2)}`,
    `Total del día: Q ${Number(summary.total_collected || 0).toFixed(2)}`,
    `Utilidad del día: Q ${Number(summary.total_profit || 0).toFixed(2)}`,
    "",
    "Nota: las propinas son una cuenta aparte y no se incluyen en las utilidades del negocio.",
  ].join("\n");
};

const drawPdfTableHeader = (doc, columns, options = {}) => {
  const startX = options.startX ?? doc.page.margins.left;
  const top = doc.y;
  const rowHeight = options.rowHeight ?? 24;

  doc.roundedRect(startX, top, columns.reduce((sum, c) => sum + c.width, 0), rowHeight, 6).fill(T.BLACK);

  let currentX = startX;
  columns.forEach((column) => {
    doc
      .fillColor(T.WHITE)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(column.label, currentX + 8, top + Math.floor((rowHeight - 9) / 2), {
        width: column.width - 16,
        align: column.align || "left",
      });
    currentX += column.width;
  });

  doc.fillColor(T.GRAY_DARK);
  doc.y = top + rowHeight + 4;
};

const drawPdfTableRow = (doc, columns, values, options = {}) => {
  const startX = options.startX ?? doc.page.margins.left;
  const top = doc.y;
  const rowHeight = options.rowHeight ?? 22;
  const fill = options.fill || T.WHITE;
  const border = options.border || T.GRAY_MID;

  doc.roundedRect(startX, top, columns.reduce((sum, c) => sum + c.width, 0), rowHeight, 4).fillAndStroke(fill, border);

  let currentX = startX;
  columns.forEach((column, index) => {
    doc
      .fillColor(options.textColor || T.GRAY_DARK)
      .font(options.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9)
      .text(String(values[index] ?? ""), currentX + 8, top + Math.floor((rowHeight - 9) / 2), {
        width: column.width - 16,
        align: column.align || "left",
      });
    currentX += column.width;
  });

  doc.fillColor(T.GRAY_DARK);
  doc.y = top + rowHeight + 3;
};

const drawPdfTotalsGrid = (doc, totals, options = {}) => {
  const cols      = options.cols      ?? 2;
  const startX    = options.startX    ?? doc.page.margins.left;
  const cardWidth = options.cardWidth ?? (doc.page.width - doc.page.margins.left - doc.page.margins.right - (cols - 1) * (options.gap ?? 10)) / cols;
  const cardHeight = options.cardHeight ?? 52;
  const gap        = options.gap        ?? 10;
  const baseY      = doc.y;

  totals.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x   = startX + col * (cardWidth + gap);
    const y   = baseY  + row * (cardHeight + gap);

    // Fondo con sombra
    doc.roundedRect(x + 2, y + 2, cardWidth, cardHeight, 8).fill("#00000018");
    doc.roundedRect(x, y, cardWidth, cardHeight, 8).fillAndStroke(item.fill || T.GRAY_LIGHT, item.border || T.GRAY_MID);

    // Acento izquierdo
    if (item.accent) {
      doc.roundedRect(x, y, 5, cardHeight, 4).fill(item.accent);
    }

    doc
      .fillColor(item.labelColor || T.GRAY_TEXT)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(item.label.toUpperCase(), x + 14, y + 10, { width: cardWidth - 20, align: "left" });
    doc
      .fillColor(item.valueColor || T.GRAY_DARK)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text(item.value, x + 14, y + 24, { width: cardWidth - 20, align: "left" });

    if (item.sub) {
      doc
        .fillColor(item.labelColor || T.GRAY_TEXT)
        .font("Helvetica")
        .fontSize(7)
        .text(item.sub, x + 14, y + cardHeight - 13, { width: cardWidth - 20, align: "left" });
    }
  });

  const totalRows = Math.ceil(totals.length / cols);
  doc.y = baseY + totalRows * (cardHeight + gap);
};

const getCenteredStartX = (doc, contentWidth) => (doc.page.width - contentWidth) / 2;

// Encabezado con branding Caligua (negro con acento rojo)
const drawCaliaguaHeader = (doc, subtitle, dateStr, options = {}) => {
  const w    = doc.page.width;
  const m    = doc.page.margins.left;
  const hH   = options.headerHeight ?? 56;
  const top  = options.top ?? doc.page.margins.top;

  // Fondo negro
  doc.rect(0, 0, w, hH).fill(T.BLACK);

  // Línea roja inferior del header
  doc.rect(0, hH - 3, w, 3).fill(T.RED);

  // Nombre empresa
  doc
    .fillColor(T.RED)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("CALIGUA", m, 10, { width: w - m * 2, align: "left" });

  doc
    .fillColor(T.GOLD)
    .font("Helvetica")
    .fontSize(9)
    .text("Restaurant BBQ & Grill", m, 32, { width: w - m * 2, align: "left" });

  // Título del reporte (derecha)
  doc
    .fillColor(T.WHITE)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(subtitle, m, 12, { width: w - m * 2, align: "right" });

  if (dateStr) {
    doc
      .fillColor(T.GRAY_MID)
      .font("Helvetica")
      .fontSize(8)
      .text(dateStr, m, 33, { width: w - m * 2, align: "right" });
  }

  doc.y = hH + 12;
};

// Sección con título en banda roja suave
const drawSectionTitle = (doc, title, options = {}) => {
  const m   = options.startX ?? doc.page.margins.left;
  const w   = options.width  ?? doc.page.width - m * 2;
  const top = doc.y;

  doc.rect(m, top, w, 20).fill(T.RED + "22");
  doc
    .fillColor(T.RED_DARK)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(title.toUpperCase(), m + 10, top + 6, { width: w - 20 });

  doc.y = top + 26;
};

// Inserta imagen PNG en el doc y avanza el cursor
const drawChartImage = (doc, pngBuffer, options = {}) => {
  const m     = options.startX ?? doc.page.margins.left;
  const imgW  = options.width  ?? doc.page.width - m * 2;
  const imgH  = options.height ?? 160;
  const top   = doc.y;

  doc.image(pngBuffer, m, top, { width: imgW, height: imgH });
  doc.y = top + imgH + (options.gap ?? 12);
};


const drawDailySoldProductsList = (doc, products, options = {}) => {
  if (!products.length) {
    return;
  }

  const startX = options.startX ?? doc.page.margins.left;
  const width = options.width ?? doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const title = options.title ?? "Productos vendidos";
  const titleGap = options.titleGap ?? 6;
  const rowHeight = options.rowHeight ?? 16;
  const baseY = options.startY ?? doc.y;
  let cursorY = baseY;

  doc
    .fillColor("#334155")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(title, startX, cursorY, { width, align: "center", lineBreak: false });

  cursorY += titleGap + 10;

  products.forEach((product) => {
    doc
      .fillColor("#111827")
      .font("Helvetica")
      .fontSize(9)
      .text(`${product.name} x ${Number(product.quantity || 0)}`, startX, cursorY, {
        width,
        align: "center",
        lineBreak: false,
        ellipsis: true,
      });
    cursorY += rowHeight;
  });

  doc.y = cursorY;
};

const buildDailySummaryPdfBuffer = async (summary) => {
  const PAGE_W    = 360;
  const MARGIN    = 16;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const sales   = Array.isArray(summary.sales) ? summary.sales : [];
  const hasTips = Number(summary.total_tips || 0) > 0;

  const P = {
    RED:         "#CC1111",
    RED_LIGHT:   "#FEE2E2",
    RED_MID:     "#FECACA",
    GOLD:        "#C8A870",
    GOLD_LIGHT:  "#FEF3C7",
    WHITE:       "#FFFFFF",
    GRAY_BG:     "#F7F7F7",
    GRAY_MID:    "#E0E0E0",
    GRAY_TEXT:   "#6B7280",
    DARK_TEXT:   "#374151",
    TBLHDR_BG:   "#F1F5F9",
    TBLHDR_TEXT: "#475569",
    BLUE_TEXT:   "#1E40AF",
    GREEN_TEXT:  "#166534",
    AMBER_TEXT:  "#92400E",
  };

  // Alturas fijas
  const HEADER_H   = 52;
  const GAP        = 10;
  const SEC_H      = 26;   // banda (20) + gap (6)
  const TBLHDR_H   = 24;   // fila encabezado (22) + gap (2)
  const TOTAL_ROW  = 22;   // altura por fila de totales
  const KPI_CNT    = hasTips ? 3 : 2;
  const TOTALS_H   = 14 + KPI_CNT * TOTAL_ROW; // separador + filas
  const NOTE_H     = hasTips ? 20 : 0;
  const BOT_PAD    = MARGIN;

  const fixedH   = HEADER_H + GAP + SEC_H + TBLHDR_H + GAP + TOTALS_H + NOTE_H + BOT_PAD;
  const rowCount = Math.max(sales.length, 1) + 1; // +1 fila subtotal
  const rowH     = Math.max(12, Math.min(20, Math.floor((820 - fixedH) / rowCount) - 2));
  const fz       = rowH <= 14 ? 7.5 : 8.5;

  const docH = fixedH + rowCount * (rowH + 2);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size:    [PAGE_W, docH],
      margins: { top: 0, left: MARGIN, right: MARGIN, bottom: BOT_PAD },
      compress: true,
      autoFirstPage: true,
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Header ────────────────────────────────────────────────────────────────
    doc.rect(0, 0, PAGE_W, HEADER_H).fill(P.RED);
    doc.rect(0, HEADER_H - 2, PAGE_W, 2).fill(P.GOLD);

    doc.fillColor(P.WHITE).font("Helvetica-Bold").fontSize(17)
      .text("CALIGUA", MARGIN, 10, { width: CONTENT_W, align: "left" });
    doc.fillColor(P.GOLD_LIGHT).font("Helvetica").fontSize(8)
      .text("Restaurant BBQ & Grill", MARGIN, 30, { width: CONTENT_W, align: "left" });
    doc.fillColor(P.WHITE).font("Helvetica-Bold").fontSize(11)
      .text("Resumen del Día", MARGIN, 11, { width: CONTENT_W, align: "right" });
    doc.fillColor("#FFD0D0").font("Helvetica").fontSize(8)
      .text(summary.date || "", MARGIN, 30, { width: CONTENT_W, align: "right" });

    doc.y = HEADER_H + GAP;

    // ── Banda de sección ──────────────────────────────────────────────────────
    const secTop = doc.y;
    doc.rect(MARGIN, secTop, CONTENT_W, 20).fill(P.RED_LIGHT);
    doc.fillColor(P.RED).font("Helvetica-Bold").fontSize(8.5)
      .text(`VENTAS DEL DÍA  (${sales.length})`, MARGIN + 8, secTop + 6,
        { width: CONTENT_W - 16 });
    doc.y = secTop + 26;

    // ── Columnas ──────────────────────────────────────────────────────────────
    const cols = hasTips
      ? [
          { label: "Venta",   width: 100, align: "left"  },
          { label: "Total",   width: 116, align: "right" },
          { label: "Propina", width: 112, align: "right" },
        ]
      : [
          { label: "Venta",   width: 140, align: "left"  },
          { label: "Total",   width: 188, align: "right" },
        ];

    const thTop = doc.y;
    doc.roundedRect(MARGIN, thTop, CONTENT_W, 22, 4).fill(P.TBLHDR_BG);
    let cx = MARGIN;
    cols.forEach(col => {
      doc.fillColor(P.TBLHDR_TEXT).font("Helvetica-Bold").fontSize(8.5)
        .text(col.label, cx + 6, thTop + 7, { width: col.width - 12, align: col.align });
      cx += col.width;
    });
    doc.y = thTop + 22 + 2;

    // ── Filas de ventas ───────────────────────────────────────────────────────
    if (sales.length === 0) {
      const rTop = doc.y;
      doc.roundedRect(MARGIN, rTop, CONTENT_W, rowH + 2, 3)
        .fillAndStroke(P.WHITE, P.GRAY_MID);
      doc.fillColor(P.GRAY_TEXT).font("Helvetica").fontSize(fz)
        .text("Sin ventas pagadas hoy", MARGIN + 6,
          rTop + Math.max(2, Math.floor((rowH - fz) / 2)),
          { width: CONTENT_W - 12, align: "center" });
      doc.y = rTop + rowH + 4;
    } else {
      sales.forEach((sale, i) => {
        const rTop = doc.y;
        doc.roundedRect(MARGIN, rTop, CONTENT_W, rowH, 3)
          .fillAndStroke(i % 2 === 0 ? P.WHITE : P.GRAY_BG, P.GRAY_MID);
        const tip  = Number(sale.tip || 0);
        const vals = hasTips
          ? [`#${sale.monthly_number ?? sale.id}`, fmtQ(sale.total), tip > 0 ? fmtQ(tip) : "—"]
          : [`#${sale.monthly_number ?? sale.id}`, fmtQ(sale.total)];
        let cx2 = MARGIN;
        cols.forEach((col, ci) => {
          doc.fillColor(P.DARK_TEXT).font("Helvetica").fontSize(fz)
            .text(String(vals[ci] ?? ""), cx2 + 6,
              rTop + Math.max(2, Math.floor((rowH - fz) / 2)),
              { width: col.width - 12, align: col.align });
          cx2 += col.width;
        });
        doc.y = rTop + rowH + 2;
      });
    }

    // ── Fila subtotal ─────────────────────────────────────────────────────────
    const subTop = doc.y;
    doc.roundedRect(MARGIN, subTop, CONTENT_W, rowH, 4)
      .fillAndStroke(P.RED_LIGHT, P.RED_MID);
    doc.fillColor(P.RED).font("Helvetica-Bold").fontSize(fz)
      .text("Subtotal ventas", MARGIN + 6,
        subTop + Math.max(2, Math.floor((rowH - fz) / 2)),
        { width: cols[0].width - 12, align: "left" });
    doc.fillColor(P.RED).font("Helvetica-Bold").fontSize(fz)
      .text(fmtQ(summary.total_sales_amount),
        MARGIN + cols[0].width,
        subTop + Math.max(2, Math.floor((rowH - fz) / 2)),
        { width: cols[1].width - 6, align: "right" });
    doc.y = subTop + rowH + 2;

    // ── Totales en texto plano ────────────────────────────────────────────────
    doc.y += GAP;
    doc.rect(MARGIN, doc.y, CONTENT_W, 1).fill(P.GRAY_MID);
    doc.y += 8;

    const totals = [
      { label: "Total ingresado",  value: fmtQ(summary.total_collected), color: P.BLUE_TEXT  },
      { label: "Ganancia del día", value: fmtQ(summary.total_profit),    color: P.GREEN_TEXT },
    ];
    if (hasTips) {
      totals.push({ label: "Propinas del día", value: fmtQ(summary.total_tips), color: P.AMBER_TEXT });
    }

    totals.forEach(row => {
      const ry = doc.y;
      doc.fillColor(P.GRAY_TEXT).font("Helvetica").fontSize(9)
        .text(row.label, MARGIN + 4, ry + 4, { width: CONTENT_W / 2 });
      doc.fillColor(row.color).font("Helvetica-Bold").fontSize(11)
        .text(row.value, MARGIN, ry + 2, { width: CONTENT_W - 4, align: "right" });
      doc.y = ry + TOTAL_ROW;
    });

    // ── Nota al pie ───────────────────────────────────────────────────────────
    if (hasTips) {
      doc.y += 6;
      doc.fillColor(P.GRAY_TEXT).font("Helvetica").fontSize(7)
        .text("* Las propinas no se incluyen en las utilidades del negocio.",
          MARGIN, doc.y, { width: CONTENT_W, align: "center" });
    }

    doc.end();
  });
};

const getMailTransport = (config) =>
  nodemailer.createTransport({
    host: config.smtpHost,
    port: Number(config.smtpPort || 587),
    secure: Boolean(config.secureConnection),
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      servername: config.smtpHost,
    },
    auth: {
      user: config.smtpUser,
      pass: config.smtpPassword,
    },
  });

const getMailRecipients = (config) => ({
  to: config.receiverEmail,
  cc: String(config.ccEmails || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean),
});

const buildSalesReportPdfBuffer = async (sales, from, to, label, extraData = {}) => {
  const { byDay = [], cashiers = [], topProducts = [] } = extraData;

  // Gráficas PNG
  const dayData  = byDay.map((d) => ({ value: Number(d.total_amount) }));
  const cashData = cashiers.slice(0, 6).map((c) => ({ value: Number(c.total_amount) }));
  const [dayChart, cashChart] = await Promise.all([
    dayData.length  > 1 ? lineChartPng(dayData,  { width: 515, height: 140 }) : null,
    cashData.length > 0 ? hBarChartPng(cashData, { width: 515, height: Math.max(100, cashData.length * 38 + 20) }) : null,
  ]);

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: "A4", margins: { top: 0, left: 40, right: 40, bottom: 30 } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Header ────────────────────────────────────────────────────────────────
    const labelCap = label.charAt(0).toUpperCase() + label.slice(1);
    drawCaliaguaHeader(doc, `Reporte ${labelCap}`, `${from}  →  ${to}`, { headerHeight: 58 });

    // ── KPI Cards ─────────────────────────────────────────────────────────────
    let totalVentas = 0;
    let totalPropinas = 0;
    sales.forEach((s) => { totalVentas += Number(s.total || 0); totalPropinas += Number(s.tip_amount || 0); });

    const kpiW = (515 - 10) / 2;
    drawPdfTotalsGrid(doc, [
      { label: "Ventas registradas", value: String(sales.length),              fill: T.GRAY_LIGHT, border: T.GRAY_MID,  accent: T.BLACK,   valueColor: T.BLACK   },
      { label: "Total vendido",      value: fmtQ(totalVentas),                 fill: T.DANGER_BG,  border: T.RED,       accent: T.RED,     valueColor: T.DANGER  },
      { label: "Total propinas",     value: fmtQ(totalPropinas),               fill: T.WARNING_BG, border: T.GOLD,      accent: T.GOLD,    valueColor: T.WARNING },
      { label: "Total cobrado",      value: fmtQ(totalVentas + totalPropinas), fill: T.BLACK,      border: T.BLACK,     accent: T.RED,     valueColor: T.GOLD    },
    ], { startX: 40, cardWidth: kpiW, cardHeight: 52, gap: 10, cols: 2 });

    // ── Gráfica tendencia por día ─────────────────────────────────────────────
    if (dayChart) {
      doc.y += 6;
      drawSectionTitle(doc, "Tendencia de ventas por día");
      drawChartImage(doc, dayChart, { width: 515, height: 140, gap: 10 });
    }

    // ── Gráfica por vendedor ──────────────────────────────────────────────────
    if (cashChart) {
      drawSectionTitle(doc, "Ventas por vendedor");
      drawChartImage(doc, cashChart, { width: 515, height: Math.max(100, cashData.length * 38 + 20), gap: 10 });
    }

    // ── Top productos ─────────────────────────────────────────────────────────
    if (topProducts.length > 0) {
      drawSectionTitle(doc, `Top ${topProducts.length} productos`);
      const prodCols = [
        { label: "Producto",  width: 300, align: "left"  },
        { label: "Unidades",  width: 105, align: "right" },
        { label: "Ingresos",  width: 110, align: "right" },
      ];
      drawPdfTableHeader(doc, prodCols, { rowHeight: 22 });
      topProducts.forEach((p, i) => {
        drawPdfTableRow(doc, prodCols,
          [p.name, String(p.units), fmtQ(p.revenue)],
          { fill: i % 2 === 0 ? T.WHITE : T.GRAY_LIGHT, border: T.GRAY_MID, rowHeight: 22 }
        );
      });
      doc.y += 8;
    }

    // ── Tabla detalle ventas ──────────────────────────────────────────────────
    drawSectionTitle(doc, "Detalle de ventas");
    const salesColumns = [
      { label: "#",         width: 50,  align: "center" },
      { label: "Vendedor",  width: 175, align: "left"   },
      { label: "Fecha",     width: 155, align: "left"   },
      { label: "Propina",   width: 65,  align: "right"  },
      { label: "Total",     width: 70,  align: "right"  },
    ];

    if (sales.length === 0) {
      doc.fillColor(T.GRAY_TEXT).font("Helvetica").fontSize(10)
        .text("No hay ventas en el rango seleccionado.", 40, doc.y, { width: 515 });
    } else {
      drawPdfTableHeader(doc, salesColumns, { rowHeight: 22 });
      sales.forEach((sale, i) => {
        if (doc.y > doc.page.height - 80) doc.addPage();
        const fecha = String(sale.paid_at || sale.created_at || "").replace("T", " ").slice(0, 16);
        drawPdfTableRow(doc, salesColumns,
          [`#${sale.monthly_number ?? sale.id}`, sale.seller || "N/A", fecha, fmtQ(sale.tip_amount), fmtQ(sale.total)],
          { fill: i % 2 === 0 ? T.WHITE : T.GRAY_LIGHT, border: T.GRAY_MID, rowHeight: 22 }
        );
      });
    }

    // ── Nota ──────────────────────────────────────────────────────────────────
    doc.y += 10;
    doc.fillColor(T.GRAY_TEXT).font("Helvetica").fontSize(8)
      .text("* Las propinas son una cuenta aparte y no se incluyen en las utilidades del negocio.",
        40, doc.y, { width: 515, align: "center" });
    doc.end();
  });
};

const buildSalesReportExcelBuffer = async (sales, from = "", to = "", cashiers = [], topProducts = [], byDay = []) => {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator  = "Caligua POS";
  workbook.modified = new Date();

  // Colores ARGB (FF + hex sin #)
  const C = {
    RED:       "FFCC1111",
    RED_DARK:  "FF8B0000",
    BLACK:     "FF1A1A1A",
    GOLD:      "FFC8A870",
    WHITE:     "FFFFFFFF",
    GRAY_LITE: "FFF7F7F7",
    GRAY_MID:  "FFE0E0E0",
    DANGER_BG: "FFFEE2E2",
    WARN_BG:   "FFFEF3C7",
    SUCCESS_BG:"FFDCFCE7",
  };
  const headerFill  = { type: "pattern", pattern: "solid", fgColor: { argb: C.BLACK } };
  const redFill     = { type: "pattern", pattern: "solid", fgColor: { argb: C.RED }   };
  const oddFill     = { type: "pattern", pattern: "solid", fgColor: { argb: C.GRAY_LITE } };
  const headerFont  = { bold: true, color: { argb: C.WHITE }, size: 10 };
  const boldFont    = { bold: true };
  const qFmt        = '"Q"#,##0.00';

  let totalVentas = 0;
  let totalPropinas = 0;
  sales.forEach((s) => { totalVentas += Number(s.total || 0); totalPropinas += Number(s.tip_amount || 0); });

  // ── Hoja 1: Resumen ───────────────────────────────────────────────────────
  const wsRes = workbook.addWorksheet("Resumen");
  wsRes.mergeCells("A1:F1");
  wsRes.getCell("A1").value = "CALIGUA — Reporte de Ventas";
  wsRes.getCell("A1").font  = { bold: true, size: 14, color: { argb: C.WHITE } };
  wsRes.getCell("A1").fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C.RED } };
  wsRes.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };
  wsRes.getRow(1).height = 28;

  wsRes.mergeCells("A2:F2");
  wsRes.getCell("A2").value = from && to ? `Período: ${from} — ${to}` : `Generado: ${new Date().toLocaleDateString("es-GT")}`;
  wsRes.getCell("A2").font  = { italic: true, size: 9, color: { argb: "FF555555" } };
  wsRes.getCell("A2").fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C.GRAY_LITE } };
  wsRes.getRow(2).height = 18;

  // KPI block fila 4
  const kpis = [
    ["Ventas registradas", sales.length,                         C.BLACK,     C.WHITE   ],
    ["Total vendido",      `Q ${totalVentas.toFixed(2)}`,        C.RED,       C.WHITE   ],
    ["Total propinas",     `Q ${totalPropinas.toFixed(2)}`,      C.GOLD,      "FF1A1A1A"],
    ["Total cobrado",      `Q ${(totalVentas + totalPropinas).toFixed(2)}`, "FF166534", C.WHITE ],
  ];
  wsRes.getRow(4).height = 14;
  kpis.forEach(([label, value, bg, fg], col) => {
    const c1 = wsRes.getCell(4, col + 1);
    const c2 = wsRes.getCell(5, col + 1);
    c1.value     = label;
    c1.font      = { bold: true, size: 8, color: { argb: "FF777777" } };
    c1.alignment = { horizontal: "center" };
    c2.value     = value;
    c2.font      = { bold: true, size: 13, color: { argb: fg } };
    c2.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    c2.alignment = { horizontal: "center", vertical: "middle" };
    wsRes.getRow(5).height = 24;
  });
  wsRes.columns = [{ width: 20 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 }];

  // Gráfica PNG incrustada (ventas por día)
  let imgRowStart = 7;
  if (byDay.length > 1) {
    const chartBuf = lineChartPng(byDay.map((d) => ({ value: Number(d.total_amount) })), { width: 480, height: 160 });
    const imgId = workbook.addImage({ buffer: chartBuf, extension: "png" });
    wsRes.addImage(imgId, { tl: { col: 0, row: imgRowStart - 1 }, br: { col: 6, row: imgRowStart + 11 } });
    imgRowStart += 14;
  }

  // Tabla de vendedores en resumen
  if (cashiers.length > 0) {
    const row = wsRes.getRow(imgRowStart);
    ["Vendedor", "Ventas", "Total", "Propinas", "Cobrado"].forEach((h, i) => {
      const c = row.getCell(i + 1);
      c.value = h;
      c.font  = headerFont;
      c.fill  = headerFill;
      c.alignment = { horizontal: "center" };
    });
    row.height = 20;
    cashiers.forEach((csh, i) => {
      const r = wsRes.getRow(imgRowStart + 1 + i);
      [csh.cashier, csh.total_sales, Number(csh.total_amount), Number(csh.total_tips), Number(csh.total_collected)].forEach((v, ci) => {
        const cell = r.getCell(ci + 1);
        cell.value = v;
        if (ci >= 2) cell.numFmt = qFmt;
        cell.fill = i % 2 === 0 ? { type: "pattern", pattern: "solid", fgColor: { argb: C.WHITE } } : oddFill;
      });
    });
  }

  // ── Hoja 2: Detalle de ventas ─────────────────────────────────────────────
  const wsDet = workbook.addWorksheet("Detalle ventas");
  wsDet.columns = [
    { header: "Venta #",       key: "id",              width: 12 },
    { header: "Vendedor",      key: "seller",           width: 28 },
    { header: "Fecha",         key: "date",             width: 22 },
    { header: "Propina",       key: "tip_amount",       width: 14 },
    { header: "Total vendido", key: "total",            width: 16 },
    { header: "Total cobrado", key: "total_collected",  width: 16 },
  ];
  wsDet.getRow(1).eachCell((cell) => {
    cell.font  = headerFont;
    cell.fill  = headerFill;
    cell.alignment = { horizontal: "center" };
  });
  wsDet.getRow(1).height = 22;

  sales.forEach((sale, i) => {
    const total = Number(sale.total || 0);
    const tip   = Number(sale.tip_amount || 0);
    const row   = wsDet.addRow({
      id:              `#${sale.monthly_number ?? sale.id}`,
      seller:          sale.seller || "N/A",
      date:            String(sale.paid_at || sale.created_at || "").replace("T", " ").slice(0, 19),
      tip_amount:      tip,
      total,
      total_collected: total + tip,
    });
    if (i % 2 !== 0) row.fill = oddFill;
    // Data bar para total (escala)
    if (totalVentas > 0) {
      const pct = total / totalVentas;
      const barCells = Math.round(pct * 10);
      row.getCell("total").fill = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: "22CC1111" },
      };
    }
  });

  const totRow = wsDet.addRow({
    seller: "TOTAL",
    tip_amount:      totalPropinas,
    total:           totalVentas,
    total_collected: totalVentas + totalPropinas,
  });
  totRow.font = boldFont;
  totRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.GRAY_MID } };

  const noteRow = wsDet.addRow({ seller: "* Las propinas no se incluyen en las utilidades del negocio." });
  noteRow.getCell("seller").font = { italic: true, size: 8, color: { argb: "FF6B7280" } };

  ["tip_amount", "total", "total_collected"].forEach((k) => { wsDet.getColumn(k).numFmt = qFmt; });

  // ── Hoja 3: Top productos ─────────────────────────────────────────────────
  if (topProducts.length > 0) {
    const wsProd = workbook.addWorksheet("Top Productos");
    wsProd.columns = [
      { header: "Producto",  key: "name",    width: 36 },
      { header: "Unidades",  key: "units",   width: 14 },
      { header: "Ingresos",  key: "revenue", width: 16 },
    ];
    wsProd.getRow(1).eachCell((cell) => {
      cell.font  = headerFont;
      cell.fill  = headerFill;
      cell.alignment = { horizontal: "center" };
    });
    wsProd.getRow(1).height = 22;

    topProducts.forEach((p, i) => {
      const row = wsProd.addRow({ name: p.name, units: p.units, revenue: p.revenue });
      if (i % 2 !== 0) row.fill = oddFill;
    });
    wsProd.getColumn("revenue").numFmt = qFmt;
  }

  return workbook.xlsx.writeBuffer();
};

const getInventoryRows = async () => {
  const result = await db.query(`
    SELECT
      p.name,
      CASE
        WHEN parent.id IS NOT NULL THEN parent.name
        ELSE c.name
      END AS category,
      CASE
        WHEN parent.id IS NOT NULL THEN c.name
        ELSE ''
      END AS subcategory,
      p.stock,
      p.cost_price,
      p.price,
      (p.stock * p.cost_price) AS inventory_value
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN categories parent ON parent.id = c.parent_id
    ORDER BY p.stock ASC, p.name ASC
  `);

  return result.rows ?? [];
};


const buildInventoryReportPdfBuffer = async (rows, categoryData = []) => {
  // Gráfica donut de distribución de valor por categoría
  let catChart = null;
  if (categoryData.length > 0) {
    catChart = pieChartPng(
      categoryData.slice(0, 6).map((c) => ({ value: Number(c.total_value) })),
      { width: 220, height: 220, donut: true }
    );
  }

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: "A4", margins: { top: 0, left: 36, right: 36, bottom: 30 } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Header ────────────────────────────────────────────────────────────────
    drawCaliaguaHeader(doc, "Reporte de Inventario", new Date().toLocaleDateString("es-GT"), { headerHeight: 58 });

    // ── KPI Cards ─────────────────────────────────────────────────────────────
    let totalStock = 0;
    let totalValue = 0;
    let critCount  = 0;
    let lowCount   = 0;
    rows.forEach((r) => {
      const s = Number(r.stock || 0);
      totalStock += s;
      totalValue += Number(r.inventory_value || 0);
      if (s <= 5)       critCount++;
      else if (s <= 15) lowCount++;
    });

    const kpiW = (515 - 10) / 2;
    drawPdfTotalsGrid(doc, [
      { label: "Total productos",   value: String(rows.length),   fill: T.GRAY_LIGHT, border: T.GRAY_MID, accent: T.BLACK,   valueColor: T.BLACK   },
      { label: "Stock total",       value: String(totalStock),    fill: T.GRAY_LIGHT, border: T.GRAY_MID, accent: T.BLACK,   valueColor: T.BLACK   },
      { label: "Valor inventario",  value: fmtQ(totalValue),      fill: T.DANGER_BG,  border: T.RED,      accent: T.RED,     valueColor: T.DANGER  },
      { label: "Stock crítico",     value: String(critCount),     fill: T.DANGER_BG,  border: T.RED_DARK, accent: T.RED_DARK,valueColor: T.DANGER  },
    ], { startX: 36, cardWidth: kpiW, cardHeight: 52, gap: 10, cols: 2 });

    // ── Gráfica + leyenda categorías ──────────────────────────────────────────
    if (catChart && categoryData.length > 0) {
      doc.y += 6;
      drawSectionTitle(doc, "Valor por categoría");

      const chartTop = doc.y;
      doc.image(catChart, 36, chartTop, { width: 180, height: 180 });

      // Leyenda a la derecha
      const legendX = 230;
      let legendY   = chartTop + 10;
      categoryData.slice(0, 6).forEach((cat, i) => {
        const hex = SERIES_HEX[i % SERIES_HEX.length];
        doc.rect(legendX, legendY, 10, 10).fill(hex);
        doc.fillColor(T.GRAY_DARK).font("Helvetica").fontSize(8)
          .text(`${cat.category}  (${fmtQ(cat.total_value)})`, legendX + 14, legendY + 1, { width: 300 });
        legendY += 18;
      });

      doc.y = Math.max(doc.y, chartTop + 188);
      doc.y += 8;
    }

    // ── Tabla de inventario ───────────────────────────────────────────────────
    drawSectionTitle(doc, "Detalle de productos");
    const invCols = [
      { label: "Producto",      width: 200, align: "left"  },
      { label: "Categoría",     width: 110, align: "left"  },
      { label: "Stock",         width: 55,  align: "right" },
      { label: "Costo",         width: 75,  align: "right" },
      { label: "Precio",        width: 75,  align: "right" },
    ];
    drawPdfTableHeader(doc, invCols, { rowHeight: 22 });

    rows.forEach((r, i) => {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const stock = Number(r.stock || 0);
      let rowFill = i % 2 === 0 ? T.WHITE : T.GRAY_LIGHT;
      let textCol = T.GRAY_DARK;

      if (stock <= 5) {
        rowFill = T.DANGER_BG;
        textCol = T.DANGER;
      } else if (stock <= 15) {
        rowFill = T.WARNING_BG;
        textCol = T.WARNING;
      }

      drawPdfTableRow(doc, invCols,
        [r.name, r.category || "Sin categoría", String(stock), fmtQ(r.cost_price), fmtQ(r.price)],
        { fill: rowFill, border: T.GRAY_MID, rowHeight: 20, textColor: textCol }
      );
    });

    doc.end();
  });
};

const buildInventoryReportExcelBuffer = async (rows, categoryData = []) => {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Caligua POS";

  const C = {
    BLACK:    "FF1A1A1A",
    RED:      "FFCC1111",
    GOLD:     "FFC8A870",
    WHITE:    "FFFFFFFF",
    GRAY:     "FFF7F7F7",
    CRIT_BG:  "FFFEE2E2",
    LOW_BG:   "FFFEF3C7",
  };
  const headerFont = { bold: true, color: { argb: C.WHITE }, size: 10 };
  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: C.BLACK } };
  const qFmt       = '"Q"#,##0.00';

  // ── Hoja 1: Inventario ────────────────────────────────────────────────────
  const ws = workbook.addWorksheet("Inventario");

  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = "CALIGUA — Reporte de Inventario";
  ws.getCell("A1").font  = { bold: true, size: 14, color: { argb: C.WHITE } };
  ws.getCell("A1").fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C.RED } };
  ws.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:G2");
  ws.getCell("A2").value = `Generado: ${new Date().toLocaleDateString("es-GT")}`;
  ws.getCell("A2").font  = { italic: true, size: 9, color: { argb: "FF666666" } };
  ws.getRow(2).height = 16;

  ws.columns = [
    { header: "Producto",         key: "name",            width: 32 },
    { header: "Categoría",        key: "category",        width: 20 },
    { header: "Subcategoría",     key: "subcategory",     width: 18 },
    { header: "Stock",            key: "stock",           width: 10 },
    { header: "Costo",            key: "cost_price",      width: 13 },
    { header: "Precio",           key: "price",           width: 13 },
    { header: "Valor Inventario", key: "inventory_value", width: 18 },
  ];

  // Poner encabezado en fila 4 (fila 3 queda vacía como separador)
  ws.getRow(4).values = ["Producto", "Categoría", "Subcategoría", "Stock", "Costo", "Precio", "Valor Inventario"];
  ws.getRow(4).eachCell((cell) => { cell.font = headerFont; cell.fill = headerFill; cell.alignment = { horizontal: "center" }; });
  ws.getRow(4).height = 20;

  let totalStock = 0;
  let totalValue = 0;

  rows.forEach((product, i) => {
    const stock = Number(product.stock || 0);
    const val   = Number(product.inventory_value || 0);
    totalStock += stock;
    totalValue += val;

    const row = ws.insertRow(5 + i, {
      name:            product.name,
      category:        product.category,
      subcategory:     product.subcategory || "",
      stock,
      cost_price:      Number(product.cost_price || 0),
      price:           Number(product.price || 0),
      inventory_value: val,
    });

    const bg = stock <= 5  ? C.CRIT_BG
             : stock <= 15 ? C.LOW_BG
             : i % 2 === 0 ? C.WHITE : C.GRAY;

    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    });
    if (stock <= 5) {
      row.getCell("stock").font = { bold: true, color: { argb: C.RED } };
    }
  });

  const totRow = ws.addRow({ name: "TOTAL", stock: totalStock, inventory_value: totalValue });
  totRow.font = { bold: true };
  totRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCDCDC" } };

  ws.getColumn("cost_price").numFmt      = qFmt;
  ws.getColumn("price").numFmt           = qFmt;
  ws.getColumn("inventory_value").numFmt = qFmt;

  // ── Hoja 2: Por categoría ─────────────────────────────────────────────────
  if (categoryData.length > 0) {
    const wsCat = workbook.addWorksheet("Por Categoría");
    wsCat.columns = [
      { header: "Categoría",        key: "category",    width: 26 },
      { header: "Stock total",      key: "total_stock", width: 14 },
      { header: "Valor inventario", key: "total_value", width: 18 },
    ];
    wsCat.getRow(1).eachCell((cell) => { cell.font = headerFont; cell.fill = headerFill; cell.alignment = { horizontal: "center" }; });
    wsCat.getRow(1).height = 20;

    categoryData.forEach((cat, i) => {
      const row = wsCat.addRow({
        category:    cat.category,
        total_stock: Number(cat.total_stock),
        total_value: Number(cat.total_value),
      });
      if (i % 2 !== 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.GRAY } };
    });
    wsCat.getColumn("total_value").numFmt = qFmt;

    // Gráfica donut embebida
    if (categoryData.length > 1) {
      const catBuf = pieChartPng(categoryData.slice(0, 6).map((c) => ({ value: Number(c.total_value) })), { width: 200, height: 200 });
      const imgId  = workbook.addImage({ buffer: catBuf, extension: "png" });
      wsCat.addImage(imgId, { tl: { col: 4, row: 1 }, br: { col: 9, row: 14 } });
    }
  }

  return workbook.xlsx.writeBuffer();
};

export const getDailyReport = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        ${localSaleDateExprNoAlias} AS date,
        COUNT(*) AS total_sales,
        COALESCE(SUM(total), 0) AS total_sales_amount,
        COALESCE(SUM(tip_amount), 0) AS total_tips,
        COALESCE(SUM(total + tip_amount), 0) AS total_collected
      FROM sales
      WHERE status = 'paid'
      GROUP BY ${localSaleDateExprNoAlias}
      ORDER BY date DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("DAILY REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte diario" });
  }
};

export const getCashierReport = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        u.id AS user_id,
        u.name AS cashier,
        COUNT(s.id) AS total_sales,
        COALESCE(SUM(s.total), 0) AS total_sales_amount,
        COALESCE(SUM(s.tip_amount), 0) AS total_tips,
        COALESCE(SUM(s.total + s.tip_amount), 0) AS total_collected
      FROM sales s
      JOIN users u ON u.id = s.user_id
      WHERE s.status = 'paid'
      GROUP BY u.id, u.name
      ORDER BY total_collected DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("CASHIER REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte por cajero" });
  }
};

export const getDailyCashierReport = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        ${localSaleDateExpr} AS date,
        u.id AS user_id,
        u.name AS cashier,
        COUNT(s.id) AS total_sales,
        COALESCE(SUM(s.total), 0) AS total_sales_amount,
        COALESCE(SUM(s.tip_amount), 0) AS total_tips,
        COALESCE(SUM(s.total + s.tip_amount), 0) AS total_collected
      FROM sales s
      JOIN users u ON u.id = s.user_id
      WHERE s.status = 'paid'
      GROUP BY ${localSaleDateExpr}, u.id, u.name
      ORDER BY date DESC, total_collected DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("DAILY CASHIER REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte diario por cajero" });
  }
};

export const getCashierRangeReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ success: false, message: "from y to son obligatorios" });
    }

    const data = await getCashierRangeData(from, to);
    res.json({ success: true, from, to, data });
  } catch (error) {
    console.error("RANGE REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte por rango" });
  }
};

export const getCanceledSalesReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = `
      SELECT
        s.id,
        s.total,
        s.tip_amount,
        s.created_at,
        s.canceled_at,
        u1.name AS sold_by,
        u2.name AS canceled_by
      FROM sales s
      JOIN users u1 ON u1.id = s.user_id
      LEFT JOIN users u2 ON u2.id = s.canceled_by
      WHERE s.status = 'canceled'
    `;

    const params = [];

    if (from && to) {
      sql += ` AND ${dateBetween(localCanceledDateExpr)}`;
      params.push(from, to);
    }

    sql += ` ORDER BY s.canceled_at DESC`;

    const result = await db.query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("CANCELED REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte de cancelaciones" });
  }
};

export const exportCashierRangeReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ success: false, message: "from y to son obligatorios" });
    }

    const data = await getCashierRangeData(from, to);
    await exportToExcel(res, data, `reporte_${from}_a_${to}`);
  } catch (error) {
    console.error("EXPORT EXCEL ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando Excel" });
  }
};

export const getDashboardSummary = async (req, res) => {
  try {
    const from = req.query.from || todayString();
    const to   = req.query.to   || from;
    const [salesData, invMetrics] = await Promise.all([
      getDashboardSummaryService(from, to, req.query.user_id || null),
      getInventoryMetricsService(),
    ]);
    const data = {
      ...salesData,
      inventory_value:          invMetrics.inventory_value,
      critical_products:        invMetrics.critical_products,
      low_stock_threshold:      invMetrics.low_stock_threshold,
      critical_stock_threshold: invMetrics.critical_stock_threshold,
    };
    res.json({ success: true, data });
  } catch (error) {
    console.error("DASHBOARD ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando dashboard" });
  }
};

export const salesReport = async (req, res) => {
  try {
    const from = req.query.from || todayString();
    const to = req.query.to || from;
    const sales = await getSalesReport(from, to);
    res.json({ success: true, data: sales });
  } catch (error) {
    console.error("SALES REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte" });
  }
};

export const getTodayLogoutSummary = async (req, res) => {
  try {
    const date = req.query.date || todayString();
    const [data, hourlyData] = await Promise.all([
      getDailySalesSummaryService(date),
      getSalesByHourService(date),
    ]);
    res.json({ success: true, data: { ...data, hourly: hourlyData } });
  } catch (error) {
    console.error("TODAY LOGOUT SUMMARY ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando resumen del dia" });
  }
};

export const sendTodayLogoutSummaryEmail = async (req, res) => {
  try {
    const date = req.body?.date || req.query.date || todayString();
    const config = await getEmailAlertConfigService();

    if (!config.smtpHost || !config.smtpUser || !config.smtpPassword || !config.senderEmail || !config.receiverEmail) {
      return res.status(400).json({
        success: false,
        message: "Completa la configuracion SMTP y el correo destinatario para enviar el resumen",
      });
    }

    const summary   = await getDailySalesSummaryService(date);
    const pdfBuffer = await buildDailySummaryPdfBuffer(summary);
    const transport = getMailTransport(config);
    const recipients = getMailRecipients(config);

    await transport.sendMail({
      from: `"${config.senderName}" <${config.senderEmail}>`,
      to: recipients.to,
      cc: recipients.cc,
      subject: `${config.subjectPrefix || "TU EMPRESA"} - Resumen del dia ${summary.date}`,
      text: buildDailySummaryEmailText(summary),
      attachments: [
        {
          filename: `resumen_ventas_${summary.date}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    res.json({ success: true, message: "Resumen enviado por correo", data: { date: summary.date } });
  } catch (error) {
    console.error("SEND LOGOUT SUMMARY EMAIL ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error enviando resumen por correo" });
  }
};

export const sendSalesRangeReportEmail = async (req, res) => {
  try {
    const from = req.body?.from || todayString();
    const to = req.body?.to || from;
    const format = String(req.body?.format || "pdf").toLowerCase();
    const label = String(req.body?.label || "ventas");
    const config = await getEmailAlertConfigService();

    if (!config.smtpHost || !config.smtpUser || !config.smtpPassword || !config.senderEmail || !config.receiverEmail) {
      return res.status(400).json({
        success: false,
        message: "Completa la configuracion SMTP y el correo destinatario para enviar el reporte",
      });
    }

    const [sales, byDay, cashiers, topProducts] = await Promise.all([
      getSalesReport(from, to),
      getSalesByDayService(from, to),
      getCashierRangeData(from, to),
      getTopProductsService(from, to, 6),
    ]);
    const transport  = getMailTransport(config);
    const recipients = getMailRecipients(config);
    const baseName   = `reporte_${label}_${from}_a_${to}`;

    const attachment =
      format === "excel"
        ? {
            filename: `${baseName}.xlsx`,
            content: await buildSalesReportExcelBuffer(sales, from, to, cashiers, topProducts, byDay),
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }
        : {
            filename: `${baseName}.pdf`,
            content: await buildSalesReportPdfBuffer(sales, from, to, label, { byDay, cashiers, topProducts }),
            contentType: "application/pdf",
          };

    await transport.sendMail({
      from: `"${config.senderName}" <${config.senderEmail}>`,
      to: recipients.to,
      cc: recipients.cc,
      subject: `${config.subjectPrefix || "TU EMPRESA"} - Reporte ${label} ${from} a ${to}`,
      text: `Adjunto reporte ${label} de ventas del rango ${from} a ${to} en formato ${format.toUpperCase()}.`,
      attachments: [attachment],
    });

    res.json({ success: true, message: "Reporte enviado por correo" });
  } catch (error) {
    console.error("SEND SALES RANGE REPORT EMAIL ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error enviando reporte por correo" });
  }
};

export const sendInventoryReportEmail = async (req, res) => {
  try {
    const format = String(req.body?.format || "excel").toLowerCase();
    const config = await getEmailAlertConfigService();

    if (!config.smtpHost || !config.smtpUser || !config.smtpPassword || !config.senderEmail || !config.receiverEmail) {
      return res.status(400).json({
        success: false,
        message: "Completa la configuracion SMTP y el correo destinatario para enviar el reporte",
      });
    }

    const [rows, categoryData] = await Promise.all([
      getInventoryRows(),
      getStockByCategoryService(),
    ]);
    const transport  = getMailTransport(config);
    const recipients = getMailRecipients(config);
    const baseName   = `reporte_inventario_${todayString()}`;

    const attachment =
      format === "pdf"
        ? {
            filename: `${baseName}.pdf`,
            content: await buildInventoryReportPdfBuffer(rows, categoryData),
            contentType: "application/pdf",
          }
        : {
            filename: `${baseName}.xlsx`,
            content: await buildInventoryReportExcelBuffer(rows, categoryData),
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          };

    await transport.sendMail({
      from: `"${config.senderName}" <${config.senderEmail}>`,
      to: recipients.to,
      cc: recipients.cc,
      subject: `${config.subjectPrefix || "TU EMPRESA"} - Reporte inventario ${todayString()}`,
      text: `Adjunto reporte de inventario en formato ${format.toUpperCase()}.`,
      attachments: [attachment],
    });

    res.json({ success: true, message: "Reporte de inventario enviado por correo" });
  } catch (error) {
    console.error("SEND INVENTORY REPORT EMAIL ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error enviando reporte de inventario por correo" });
  }
};

export const exportSalesRangeReport = async (req, res) => {
  try {
    const from   = req.query.from   || todayString();
    const to     = req.query.to     || from;
    const format = String(req.query.format || "excel").toLowerCase();
    const label  = String(req.query.label  || "ventas");

    const [sales, byDay, cashiers, topProducts] = await Promise.all([
      getSalesReport(from, to),
      getSalesByDayService(from, to),
      getCashierRangeData(from, to),
      getTopProductsService(from, to, 6),
    ]);

    if (format === "pdf") {
      const filename        = `reporte_${label}_${from}_a_${to}.pdf`;
      const encodedFilename = encodeURIComponent(filename);
      const pdfBuffer       = await buildSalesReportPdfBuffer(sales, from, to, label, { byDay, cashiers, topProducts });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
      res.end(pdfBuffer);
      return;
    }

    const excelBuffer     = await buildSalesReportExcelBuffer(sales, from, to, cashiers, topProducts, byDay);
    const filename        = `reporte_${label}_${from}_a_${to}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
    res.end(excelBuffer);
  } catch (error) {
    console.error("EXPORT SALES REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte de ventas" });
  }
};

export const getTodayCashierReport = async (req, res) => {
  try {
    const today = todayString();
    const data = await getCashierRangeData(today, today);
    res.json({ success: true, data });
  } catch (error) {
    console.error("TODAY CASHIER ERROR:", error);
    res.status(500).json({ success: false, message: "Error al obtener la caja de hoy por cajero" });
  }
};

export const getInventoryReport = async (req, res) => {
  try {
    const rows = await getInventoryRows();
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("INVENTORY REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte de inventario" });
  }
};

export const exportInventoryExcel = async (req, res) => {
  try {
    const [rows, categoryData] = await Promise.all([getInventoryRows(), getStockByCategoryService()]);
    const excelBuffer     = await buildInventoryReportExcelBuffer(rows, categoryData);
    const filename        = `reporte_inventario_${todayString()}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
    res.end(excelBuffer);
  } catch (error) {
    console.error("INVENTORY EXCEL ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando Excel inventario" });
  }
};

export const exportInventoryReport = async (req, res) => {
  try {
    const format = String(req.query.format || "excel").toLowerCase();
    const [rows, categoryData] = await Promise.all([getInventoryRows(), getStockByCategoryService()]);

    if (format === "pdf") {
      const filename        = `reporte_inventario_${todayString()}.pdf`;
      const encodedFilename = encodeURIComponent(filename);
      const pdfBuffer       = await buildInventoryReportPdfBuffer(rows, categoryData);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
      res.end(pdfBuffer);
      return;
    }

    const excelBuffer     = await buildInventoryReportExcelBuffer(rows, categoryData);
    const filename        = `reporte_inventario_${todayString()}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
    res.end(excelBuffer);
  } catch (error) {
    console.error("INVENTORY REPORT EXPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte de inventario" });
  }
};

export const generateSaleReceiptPdf = async (req, res) => {
  try {
    const sale = await getSaleByIdService(Number(req.params.id));

    if (!sale) {
      return res.status(404).send("Venta no encontrada");
    }

    const doc = new PDFDocument({ size: "A4", margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=receipt_${sale.monthly_number ?? sale.id}.pdf`);

    doc.pipe(res);
    doc.fontSize(18).text("Recibo de Venta", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Venta #${sale.monthly_number ?? sale.id}`);
    doc.text(`Referencia: ${sale.reference || "-"}`);
    doc.text(`Cajero: ${sale.user_name}`);
    doc.text(`Fecha: ${new Date(sale.created_at).toLocaleString()}`);
    doc.moveDown();
    doc.text("Productos:");
    doc.moveDown(0.5);

    sale.items.forEach((item) => {
      doc.text(`${item.name}  x${item.quantity}   Q ${Number(item.price * item.quantity).toFixed(2)}`);
    });

    doc.moveDown();
    const tipAmt = Number(sale.tip_amount || 0);
    if (tipAmt > 0) {
      doc.text(`Subtotal: Q ${Number(sale.total).toFixed(2)}`);
      doc.text(`Propina (${Number(sale.tip_percentage || 0)}%): Q ${tipAmt.toFixed(2)}`);
      doc.font("Helvetica-Bold").text(`Total: Q ${(Number(sale.total) + tipAmt).toFixed(2)}`);
    } else {
      doc.text(`Total: Q ${Number(sale.total).toFixed(2)}`);
    }

    doc.end();
  } catch (error) {
    console.error("RECEIPT PDF ERROR:", error);
    res.status(500).send("Error generando recibo");
  }
};

export const getInventoryMetrics = async (req, res) => {
  try {
    const data = await getInventoryMetricsService();
    res.json({ success: true, data });
  } catch (error) {
    console.error("INVENTORY METRICS ERROR:", error);
    res.status(500).json({ success: false, message: "Error obteniendo métricas de inventario" });
  }
};
