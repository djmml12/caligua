import { buildEscPosLogoBytes } from "./escpos-logo.js";

/* ─────────────────────────────────────────────────────────────────────────────
 * ESC/POS builder for thermal printers (Rongta, Epson, Xprinter, etc.)
 *
 * Resolution assumed: 203 dpi  →  8 dots / mm (standard for ESC/POS thermals)
 * Print area in dots:
 *   58 mm paper →  384 dots
 *   80 mm paper →  576 dots
 *
 * Margins are applied via NATIVE hardware commands (precise, work for raster
 * logos and centered text alike):
 *   - Left margin:           GS L  nL nH    (dots from paper edge)
 *   - Print area width:      GS W  nL nH    (dots, defines right boundary)
 *   - Top / bottom feed:     ESC J n        (dots ≈ 0.125 mm each)
 *
 * Character cell (Font A): 12 dots wide × 24 dots tall.
 *   80 mm: 576 / 12 = 48 chars per line.
 *   58 mm: 384 / 12 = 32 chars per line.
 * Content width is recomputed from the (possibly reduced) print area.
 * ──────────────────────────────────────────────────────────────────────────── */

const DOTS_PER_MM           = 8;
const CHAR_WIDTH_DOTS       = 12;
const VERTICAL_UNIT_MM      = 1 / 8; // ESC J unit = 1/203" ≈ 0.125 mm (forzado vía GS P 203 203 en prelude)
// Printable dot count varies by printer head: nominal paper width minus the
// ~4mm physical margin imposed by the platen on each side. These are the
// canonical values for ESC/POS thermals (Rongta, Epson TM, Xprinter, etc.).
// Modelos no-estándar pueden requerir printable_dots_override en la config.
const PRINTABLE_DOTS_80MM   = 576; // 72 mm usable
const PRINTABLE_DOTS_58MM   = 384; // 48 mm usable — algunas Rongta tienen 360 o 320
// Distancia física entre cabezal térmico y cuchilla. Se suma al margin_bottom_mm
// para que el último renglón impreso no quede dentro del corte.
const CUTTER_FEED_MM        = 12;

const stripAccents = (value) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/×/g, "x");

const sanitizeText = (value) =>
  stripAccents(String(value || ""))
    .replace(/[^\x20-\x7E\n]/g, "")
    .trimEnd();

const encodeText = (value) => {
  const encoder = new TextEncoder();
  return Array.from(encoder.encode(sanitizeText(value)));
};

const wrapText = (value, width) => {
  const clean = sanitizeText(value).trim();
  if (!clean) return [""];

  const words = clean.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!current) { current = word; continue; }
    if (`${current} ${word}`.length <= width) { current = `${current} ${word}`; continue; }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
};

const pairLine = (left, right, width) => {
  const leftClean  = sanitizeText(left);
  const rightClean = sanitizeText(right);
  const space = Math.max(1, width - leftClean.length - rightClean.length);
  return `${leftClean}${" ".repeat(space)}${rightClean}`;
};

const divider = (width) => "-".repeat(width);

/* ── Native ESC/POS commands ─────────────────────────────────────────────── */

const initializeCommands = () => [27, 64];          // ESC @
const codePageCP858      = () => [27, 116, 19];     // ESC t 19 (CP858, multi-byte safe set)
const boldOn             = () => [27, 69, 1];
const boldOff            = () => [27, 69, 0];
const centerAlign        = () => [27, 97, 1];
const leftAlign          = () => [27, 97, 0];
const cut                = () => [29, 86, 66, 0];   // GS V B 0 (partial cut + feed)

/** GS L nL nH — left margin in dots (origin shift) */
const setLeftMarginDots = (dots) => {
  const n = Math.max(0, Math.min(65535, Math.round(dots)));
  return [29, 76, n & 0xff, (n >> 8) & 0xff];
};

/** GS W nL nH — print-area width in dots (defines effective line width) */
const setPrintAreaWidthDots = (dots) => {
  const n = Math.max(8, Math.min(65535, Math.round(dots)));
  return [29, 87, n & 0xff, (n >> 8) & 0xff];
};

/** ESC J n — feed n vertical motion units (≈ 0.125 mm each) */
const feedDots = (dots) => {
  const out = [];
  let remaining = Math.max(0, Math.round(dots));
  while (remaining > 0) {
    const chunk = Math.min(255, remaining);
    out.push(27, 74, chunk);
    remaining -= chunk;
  }
  return out;
};

const feedMm = (mm) => feedDots(Math.max(0, Number(mm) || 0) / VERTICAL_UNIT_MM);

const pushLine = (buffer, line = "") => {
  buffer.push(...encodeText(line), 10);
};

/* ── Config resolution ───────────────────────────────────────────────────── */

const resolveConfig = (printerConfig = {}) => {
  const widthMm      = Number(printerConfig.width_mm) === 58 ? 58 : 80;
  const defaultDots  = widthMm === 58 ? PRINTABLE_DOTS_58MM : PRINTABLE_DOTS_80MM;
  // printable_dots_override permite ajustar modelos Rongta no-estándar (ej. 360 dots en 58mm)
  const totalDots    = printerConfig.printable_dots_override
    ? Math.max(192, Math.min(65535, Number(printerConfig.printable_dots_override)))
    : defaultDots;

  const leftMm   = Math.max(0, Number(printerConfig.margin_left_mm)   || 0);
  const rightMm  = Math.max(0, Number(printerConfig.margin_right_mm)  || 0);
  const topMm    = printerConfig.margin_top_mm    != null
    ? Math.max(0, Number(printerConfig.margin_top_mm))    : 1;
  const bottomMm = printerConfig.margin_bottom_mm != null
    ? Math.max(0, Number(printerConfig.margin_bottom_mm)) : 3;

  const leftDots  = Math.round(leftMm  * DOTS_PER_MM);
  const rightDots = Math.round(rightMm * DOTS_PER_MM);

  // Reserve at least ~16 chars (16 × 12 = 192 dots) so output never collapses
  const minPrintAreaDots = 16 * CHAR_WIDTH_DOTS;
  const printAreaDots = Math.max(
    minPrintAreaDots,
    totalDots - leftDots - rightDots,
  );

  // Recompute usable left if right pushed the floor
  const effectiveLeftDots = Math.min(leftDots, totalDots - printAreaDots);

  const contentWidth = Math.max(16, Math.floor(printAreaDots / CHAR_WIDTH_DOTS));

  // Logo ancho en múltiplo de 8: evita bytes residuales en GS v 0 que algunos
  // firmwares Rongta truncan o desplazan en el lado derecho del logo.
  const logoDots = Math.floor(printAreaDots / 8) * 8;

  return {
    widthMm: String(widthMm),
    totalDots,
    leftDots: effectiveLeftDots,
    printAreaDots,
    contentWidth,
    topMm,
    bottomMm,
    logoDots,
  };
};

/** Emit the standard prelude: init + code page + margins + top feed. */
const pushPrelude = (bytes, cfg) => {
  bytes.push(
    ...initializeCommands(),                       // ESC @ — must come first (resets margins)
    ...codePageCP858(),
    29, 80, 203, 203,                              // GS P x y — fija motion units a 1/203" (8 dots/mm)
    ...setLeftMarginDots(cfg.leftDots),            // GS L
    ...setPrintAreaWidthDots(cfg.printAreaDots),   // GS W
    ...feedMm(cfg.topMm),                          // ESC J × n
  );
};

const pushHeaderBlock = async (bytes, printerConfig, cfg) => {
  // Para logo y header centrado, alinear respecto al centro físico del rollo aunque
  // los márgenes izq/der sean asimétricos. Se logra desplazando GS L al valor que
  // pone el área a la mitad del rollo, y restaurando el GS L de cuerpo después.
  const centerLeftDots = Math.round((cfg.totalDots - cfg.printAreaDots) / 2);
  const useTempCenter  = centerLeftDots !== cfg.leftDots;

  if (printerConfig.logo_data_url) {
    try {
      const logoBytes = await buildEscPosLogoBytes(printerConfig.logo_data_url, cfg.logoDots);
      if (logoBytes.length > 0) {
        if (useTempCenter) bytes.push(...setLeftMarginDots(centerLeftDots));
        bytes.push(...centerAlign(), ...logoBytes, ...leftAlign(), 10);
        if (useTempCenter) bytes.push(...setLeftMarginDots(cfg.leftDots));
      }
    } catch { /* skip logo on error */ }
  }

  const headerRaw = sanitizeText(printerConfig.header_text ?? "");
  if (headerRaw) {
    if (useTempCenter) bytes.push(...setLeftMarginDots(centerLeftDots));
    bytes.push(...centerAlign());
    headerRaw.split("\n").forEach((line) => {
      if (line.trim()) pushLine(bytes, line.trim());
    });
    bytes.push(...leftAlign());
    if (useTempCenter) bytes.push(...setLeftMarginDots(cfg.leftDots));
  }
};

const pushFooterBlock = (bytes, printerConfig, cfg) => {
  const footerRaw = sanitizeText(printerConfig.footer_text ?? "");
  if (!footerRaw) return;
  const centerLeftDots = Math.round((cfg.totalDots - cfg.printAreaDots) / 2);
  const useTempCenter  = centerLeftDots !== cfg.leftDots;
  if (useTempCenter) bytes.push(...setLeftMarginDots(centerLeftDots));
  bytes.push(...centerAlign());
  footerRaw.split("\n").forEach((line) => {
    if (line.trim()) pushLine(bytes, line.trim());
  });
  bytes.push(...leftAlign());
  if (useTempCenter) bytes.push(...setLeftMarginDots(cfg.leftDots));
};

/* ── Sales Range Summary ─────────────────────────────────────────────────── */

export const buildEscPosSalesRangeSummaryBytes = async (summary, printerConfig = {}) => {
  const cfg = resolveConfig(printerConfig);
  const { contentWidth, bottomMm } = cfg;
  const bytes = [];
  const isMultiDay = summary.from !== summary.to;

  const fmtMoney = (n) => `Q${Number(n || 0).toFixed(2)}`;
  const fmtDate  = (d) => {
    const parts = String(d ?? "").split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : String(d ?? "");
  };

  pushPrelude(bytes, cfg);
  await pushHeaderBlock(bytes, printerConfig, cfg);

  bytes.push(...centerAlign(), ...boldOn());
  pushLine(bytes, "RESUMEN DE VENTAS");
  bytes.push(...boldOff());

  const subtitle = isMultiDay
    ? `${summary.from} al ${summary.to}`
    : String(summary.from ?? "");
  pushLine(bytes, subtitle);
  bytes.push(...leftAlign());
  pushLine(bytes, divider(contentWidth));

  const colHeader = isMultiDay
    ? pairLine("FECHA  #VENTA  TOTAL", "PROPINA", contentWidth)
    : pairLine("#VENTA   TOTAL", "PROPINA", contentWidth);
  pushLine(bytes, colHeader);
  pushLine(bytes, divider(contentWidth));

  if (!summary.sales || summary.sales.length === 0) {
    pushLine(bytes, "Sin ventas en el periodo.");
  } else {
    for (const sale of summary.sales) {
      const left = isMultiDay
        ? `${fmtDate(sale.date)} #${sale.monthly_number ?? sale.id} ${fmtMoney(sale.total)}`
        : `#${sale.monthly_number ?? sale.id}  ${fmtMoney(sale.total)}`;
      const right = fmtMoney(sale.tip ?? 0);
      pushLine(bytes, pairLine(left, right, contentWidth));
    }
  }

  pushLine(bytes, divider(contentWidth));
  bytes.push(...boldOn());
  pushLine(bytes, pairLine("Ventas:",   fmtMoney(summary.total_sales_amount), contentWidth));
  pushLine(bytes, pairLine("Propinas:", fmtMoney(summary.total_tips),         contentWidth));
  pushLine(bytes, pairLine("TOTAL:",    fmtMoney(summary.total_collected),    contentWidth));
  bytes.push(...boldOff());
  pushLine(bytes, divider(contentWidth));

  const count = (summary.sales ?? []).length;
  bytes.push(...centerAlign());
  pushLine(bytes, `${count} ventas`);
  bytes.push(...leftAlign());

  pushFooterBlock(bytes, printerConfig, cfg);

  bytes.push(...feedMm(bottomMm + CUTTER_FEED_MM), ...cut());
  return bytes;
};

/* ── Daily Sales Summary ─────────────────────────────────────────────────── */

export const buildEscPosDailySalesSummaryBytes = async (summary, printerConfig = {}) => {
  const cfg = resolveConfig(printerConfig);
  const { contentWidth, bottomMm } = cfg;
  const bytes = [];

  const fmtMoney = (n) => `Q${Number(n || 0).toFixed(2)}`;

  pushPrelude(bytes, cfg);
  await pushHeaderBlock(bytes, printerConfig, cfg);

  bytes.push(...centerAlign(), ...boldOn());
  pushLine(bytes, "RESUMEN VENTAS DEL DIA");
  bytes.push(...boldOff());
  pushLine(bytes, String(summary.date ?? ""));
  bytes.push(...leftAlign());
  pushLine(bytes, divider(contentWidth));

  pushLine(bytes, pairLine("#VENTA  TOTAL", "PROPINA", contentWidth));
  pushLine(bytes, divider(contentWidth));

  if (!summary.sales || summary.sales.length === 0) {
    pushLine(bytes, "Sin ventas hoy.");
  } else {
    for (const sale of summary.sales) {
      const left  = `#${sale.monthly_number ?? sale.id}  ${fmtMoney(sale.total)}`;
      const right = fmtMoney(sale.tip ?? 0);
      pushLine(bytes, pairLine(left, right, contentWidth));
    }
  }

  pushLine(bytes, divider(contentWidth));
  bytes.push(...boldOn());
  pushLine(bytes, pairLine("Ventas:",    fmtMoney(summary.total_sales_amount), contentWidth));
  pushLine(bytes, pairLine("Propinas:",  fmtMoney(summary.total_tips),         contentWidth));
  pushLine(bytes, pairLine("TOTAL DIA:", fmtMoney(summary.total_collected),    contentWidth));
  bytes.push(...boldOff());
  pushLine(bytes, divider(contentWidth));

  bytes.push(...centerAlign());
  pushLine(bytes, `${(summary.sales ?? []).length} ventas`);
  bytes.push(...leftAlign());

  pushFooterBlock(bytes, printerConfig, cfg);

  bytes.push(...feedMm(bottomMm + CUTTER_FEED_MM), ...cut());
  return bytes;
};

/* ── Kitchen Ticket ──────────────────────────────────────────────────────── */

export const buildEscPosKitchenTicketBytes = (ticket, printerConfig = {}) => {
  const cfg = resolveConfig(printerConfig);
  const { contentWidth, bottomMm } = cfg;
  const bytes = [];

  pushPrelude(bytes, cfg);

  bytes.push(...centerAlign(), ...boldOn());
  if (ticket.reference) {
    wrapText(ticket.reference, contentWidth).forEach((line) => pushLine(bytes, line));
  }
  bytes.push(...boldOff());

  if (ticket.created_at) {
    pushLine(bytes, new Date(ticket.created_at).toLocaleString());
  }

  bytes.push(...leftAlign());
  pushLine(bytes, divider(contentWidth));

  if (ticket.notes) {
    bytes.push(...boldOn());
    wrapText(`NOTA: ${ticket.notes}`, Math.max(8, contentWidth - 2)).forEach((line) =>
      pushLine(bytes, line)
    );
    bytes.push(...boldOff());
    pushLine(bytes, divider(contentWidth));
  }

  if (!ticket.items || ticket.items.length === 0) {
    pushLine(bytes, "SIN PRODUCTOS");
  } else {
    ticket.items.forEach((item) => {
      const qty = Number(item.quantity || 0);
      wrapText(String(item.name || ""), Math.max(8, contentWidth - 4)).forEach((line, index, lines) => {
        const qtyStr = index === lines.length - 1 ? `x${qty}` : "";
        pushLine(bytes, pairLine(line, qtyStr, contentWidth));
      });
      if (item.notes) {
        bytes.push(...boldOn());
        wrapText(`>> ${item.notes}`, Math.max(6, contentWidth - 4)).forEach((line) =>
          pushLine(bytes, line)
        );
        bytes.push(...boldOff());
      }
    });
  }

  pushLine(bytes, divider(contentWidth));
  bytes.push(...feedMm(bottomMm + CUTTER_FEED_MM), ...cut());

  return bytes;
};

/* ── Sale Receipt ────────────────────────────────────────────────────────── */

export const buildEscPosReceiptBytes = async (sale, printerConfig = {}) => {
  const cfg = resolveConfig(printerConfig);
  const { contentWidth, bottomMm } = cfg;
  const bytes = [];

  const fmtMoney = (n) => `Q${Number(n || 0).toFixed(2)}`;
  const fmtDate  = (d) => {
    try { return new Date(d).toLocaleString("es-GT", { timeZone: "America/Guatemala" }); }
    catch { return String(d ?? ""); }
  };

  pushPrelude(bytes, cfg);
  await pushHeaderBlock(bytes, printerConfig, cfg);

  bytes.push(...centerAlign(), ...boldOn());
  pushLine(bytes, `ORDEN #${sale.monthly_number ?? sale.id}`);
  bytes.push(...boldOff());

  if (sale.reference) {
    pushLine(bytes, sale.reference);
  }
  bytes.push(...leftAlign());

  pushLine(bytes, fmtDate(sale.created_at));
  if (sale.user_name) pushLine(bytes, `Atendio: ${sanitizeText(sale.user_name)}`);
  pushLine(bytes, divider(contentWidth));

  const items = sale.items ?? [];
  if (items.length === 0) {
    pushLine(bytes, "Sin productos");
  } else {
    for (const item of items) {
      const qty      = Number(item.quantity || 1);
      const price    = Number(item.price_at_sale || item.price || 0);
      const subtotal = fmtMoney(qty * price);
      const nameLine = pairLine(
        `${qty}x ${sanitizeText(item.name || "")}`.slice(0, contentWidth - subtotal.length - 1),
        subtotal,
        contentWidth,
      );
      pushLine(bytes, nameLine);
      if (item.notes) {
        pushLine(bytes, `  >> ${sanitizeText(item.notes)}`);
      }
    }
  }

  pushLine(bytes, divider(contentWidth));

  const tipAmt = Number(sale.tip_amount || 0);
  if (tipAmt > 0) {
    pushLine(bytes, pairLine("Subtotal:", fmtMoney(sale.total), contentWidth));
    pushLine(bytes, pairLine(`Propina (${sale.tip_percentage ?? 0}%):`, fmtMoney(tipAmt), contentWidth));
  }
  bytes.push(...boldOn());
  pushLine(bytes, pairLine("TOTAL:", fmtMoney(Number(sale.total || 0) + tipAmt), contentWidth));
  bytes.push(...boldOff());

  if (sale.notes) {
    pushLine(bytes, divider(contentWidth));
    wrapText(`Nota: ${sale.notes}`, contentWidth).forEach((line) => pushLine(bytes, line));
  }

  pushFooterBlock(bytes, printerConfig, cfg);

  bytes.push(...feedMm(bottomMm + CUTTER_FEED_MM), ...cut());
  return bytes;
};

/* ── Logout compact summary ──────────────────────────────────────────────── */

export const buildEscPosLogoutCompactBytes = (summary, printerConfig = {}) => {
  const cfg = resolveConfig(printerConfig);
  const { contentWidth } = cfg;
  const bytes = [];

  const fmtMoney = (n) => `Q${Number(n || 0).toFixed(2)}`;

  pushPrelude(bytes, cfg);

  bytes.push(...centerAlign(), ...boldOn());
  pushLine(bytes, `RESUMEN ${String(summary.from ?? summary.date ?? "")}`);
  bytes.push(...boldOff(), ...leftAlign());
  pushLine(bytes, divider(contentWidth));

  if (!summary.sales || summary.sales.length === 0) {
    pushLine(bytes, "Sin ventas.");
  } else {
    const half = Math.floor(contentWidth / 2) - 1;
    let col = 0;
    let rowBuf = "";
    for (const sale of summary.sales) {
      const entry = `#${sale.monthly_number ?? sale.id} ${fmtMoney(sale.total)}`;
      if (col === 0) {
        rowBuf = entry.padEnd(half);
        col = 1;
      } else {
        pushLine(bytes, `${rowBuf} ${entry}`);
        rowBuf = "";
        col = 0;
      }
    }
    if (col === 1) pushLine(bytes, rowBuf.trimEnd());
  }

  pushLine(bytes, divider(contentWidth));
  bytes.push(...boldOn());
  pushLine(bytes, pairLine("VENTAS:",   fmtMoney(summary.total_sales_amount), contentWidth));
  pushLine(bytes, pairLine("PROPINAS:", fmtMoney(summary.total_tips),         contentWidth));
  pushLine(bytes, pairLine("TOTAL:",    fmtMoney(summary.total_collected),    contentWidth));
  bytes.push(...boldOff());

  bytes.push(...centerAlign());
  pushLine(bytes, `${(summary.sales ?? []).length} ventas`);
  bytes.push(...leftAlign());

  bytes.push(...feedMm(CUTTER_FEED_MM), ...cut());
  return bytes;
};

/* ── Test page ───────────────────────────────────────────────────────────── */
/* Exposed so print.controller.js can build a margin-aware test print without
 * duplicating the prelude logic. */

export const buildEscPosTestPageBytes = (printerConfig = {}, info = {}) => {
  const cfg = resolveConfig(printerConfig);
  const { contentWidth, bottomMm } = cfg;
  const bytes = [];

  pushPrelude(bytes, cfg);

  bytes.push(...centerAlign(), ...boldOn());
  pushLine(bytes, "PRUEBA DE IMPRESION");
  bytes.push(...boldOff());
  pushLine(bytes, "Fenix POS");
  bytes.push(...leftAlign());
  pushLine(bytes, divider(contentWidth));

  if (info.now)        pushLine(bytes, `Fecha:    ${info.now}`);
  pushLine(bytes,                     `Papel:    ${cfg.widthMm} mm (${cfg.totalDots} dots)`);
  pushLine(bytes,                     `Margenes: I=${(cfg.leftDots / DOTS_PER_MM).toFixed(1)}mm  D=${((cfg.totalDots - cfg.leftDots - cfg.printAreaDots) / DOTS_PER_MM).toFixed(1)}mm`);
  pushLine(bytes,                     `          T=${cfg.topMm}mm  B=${cfg.bottomMm}mm`);
  pushLine(bytes,                     `Ancho:    ${contentWidth} caracteres`);
  if (info.connection) pushLine(bytes, `Conexion: ${info.connection}`);
  pushLine(bytes, divider(contentWidth));

  // Visual ruler so the operator can verify margins line up
  const ruler = Array.from({ length: contentWidth }, (_, i) => String((i + 1) % 10)).join("");
  pushLine(bytes, ruler);

  bytes.push(...centerAlign());
  pushLine(bytes, "** Impresora OK **");
  bytes.push(...leftAlign());

  bytes.push(...feedMm(bottomMm + CUTTER_FEED_MM), ...cut());
  return bytes;
};
