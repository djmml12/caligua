import net  from "net";
import http from "http";
import db from "../config/db.js";
import { getDailySalesSummaryService, getRangeSalesSummaryService } from "../services/reports.service.js";
import { getSaleByIdService } from "../services/sales.service.js";
import {
  buildEscPosReceiptBytes,
  buildEscPosKitchenTicketBytes,
  buildEscPosDailySalesSummaryBytes,
  buildEscPosSalesRangeSummaryBytes,
  buildEscPosLogoutCompactBytes,
  buildEscPosTestPageBytes,
} from "../utils/escpos-builder.js";

const PRINTER_CONFIG_KEY     = "printer_config";
const PRINTER_CONFIG_BAR_KEY = "printer_config_bar";
const PRINTER_MODE_KEY       = "printer_mode";

const getPrinterModeFromDb = async () => {
  try {
    const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [PRINTER_MODE_KEY]);
    const rows = result.rows ?? [];
    if (!rows.length || !rows[0]?.value) return "single";
    return String(rows[0].value).toLowerCase() === "dual" ? "dual" : "single";
  } catch {
    return "single";
  }
};

const getPrinterConfigFromDb = async () => {
  const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [PRINTER_CONFIG_KEY]);
  const rows = result.rows ?? [];
  if (!rows.length || !rows[0]?.value) return null;
  try {
    const config = JSON.parse(rows[0].value);
    return (config?.ip || config?.cups_url) ? config : null;
  } catch {
    return null;
  }
};

const getBarPrinterConfigFromDb = async () => {
  const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [PRINTER_CONFIG_BAR_KEY]);
  const rows = result.rows ?? [];
  if (!rows.length || !rows[0]?.value) return null;
  try {
    const config = JSON.parse(rows[0].value);
    return (config?.ip || config?.cups_url) ? config : null;
  } catch {
    return null;
  }
};

/* ── IPP (CUPS) helpers ──────────────────────────────────── */

const normalizeCupsUrl = (raw) =>
  raw.replace(/^https?:\/\//, "http://").replace(/^ipp:\/\//, "http://");

const ippUri = (raw) =>
  raw.replace(/^https?:\/\//, "ipp://").replace(/^ipp:\/\//, "ipp://");

const writeIppString = (str) => {
  const val = Buffer.from(str, "utf8");
  const len = Buffer.allocUnsafe(2);
  len.writeUInt16BE(val.length);
  return Buffer.concat([len, val]);
};

const writeIppAttr = (tag, name, value) =>
  Buffer.concat([Buffer.from([tag]), writeIppString(name), writeIppString(value)]);

const buildIppRequest = (printerUri, docBytes) => {
  const header = Buffer.from([0x01, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01, 0x01]);
  const attrs  = Buffer.concat([
    writeIppAttr(0x47, "attributes-charset",         "utf-8"),
    writeIppAttr(0x48, "attributes-natural-language", "en-us"),
    writeIppAttr(0x45, "printer-uri",                printerUri),
    writeIppAttr(0x42, "requesting-user-name",        "pos"),
    writeIppAttr(0x42, "job-name",                    "POS Ticket"),
    writeIppAttr(0x49, "document-format",             "application/vnd.cups-raw"),
  ]);
  return Buffer.concat([header, attrs, Buffer.from([0x03]), docBytes]);
};

const sendViaCups = (cupsUrl, data) =>
  new Promise((resolve, reject) => {
    const url  = new URL(normalizeCupsUrl(cupsUrl));
    const body = buildIppRequest(ippUri(cupsUrl), data);
    const req  = http.request(
      { hostname: url.hostname, port: Number(url.port) || 631, path: url.pathname,
        method: "POST", headers: { "Content-Type": "application/ipp", "Content-Length": body.length } },
      (res) => {
        res.resume();
        res.statusCode < 400 ? resolve() : reject(new Error(`IPP HTTP ${res.statusCode}`));
      }
    );
    req.on("error", (err) => reject(wrapConnectionError(err, "la impresora CUPS")));
    req.setTimeout(8000, () => { req.destroy(); reject(Object.assign(new Error("Tiempo de espera agotado con la impresora CUPS"), { isConnectionError: true })); });
    req.write(body);
    req.end();
  });

/* ── Raw TCP helpers ─────────────────────────────────────── */

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ETIMEDOUT", "ENOTFOUND",
]);

const wrapConnectionError = (err, label = "la impresora") => {
  if (CONNECTION_ERROR_CODES.has(err.code || "")) {
    return Object.assign(new Error(`No se pudo conectar con ${label}`), { isConnectionError: true });
  }
  return err;
};

/** POST /print/receipt  —  print a sale receipt */
export const printReceipt = async (req, res) => {
  try {
    const saleId = req.body?.sale_id ?? req.body?.saleId;
    if (!saleId) {
      return res.status(400).json({ success: false, message: "sale_id requerido" });
    }

    const config = await getPrinterConfigFromDb();
    if (!config) {
      return res.status(503).json({ success: false, message: "Impresora no configurada" });
    }

    const sale = await getSaleByIdService(saleId);
    if (!sale) {
      return res.status(404).json({ success: false, message: "Venta no encontrada" });
    }

    const bytes = await buildEscPosReceiptBytes(sale, config);
    const buf   = Buffer.from(bytes);

    if (config.cups_url) {
      await sendViaCups(config.cups_url, buf);
    } else {
      await sendToPrinter(config.ip, config.port, buf);
    }

    res.json({ success: true, message: "Ticket enviado a la impresora" });
  } catch (error) {
    console.error("PRINT RECEIPT ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error al imprimir" });
  }
};

/** POST /print/summary?from=YYYY-MM-DD&to=YYYY-MM-DD  —  print sales summary for a date range (defaults to today) */
export const printSummary = async (req, res) => {
  try {
    const config = await getPrinterConfigFromDb();
    if (!config) {
      return res.status(503).json({ success: false, message: "Impresora no configurada" });
    }

    const now   = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const from  = String(req.query.from || today).slice(0, 10);
    const to    = String(req.query.to   || today).slice(0, 10);

    const summary = await getRangeSalesSummaryService(from, to);
    const bytes   = buildEscPosLogoutCompactBytes(summary, config);
    const buf     = Buffer.from(bytes);

    if (config.cups_url) {
      await sendViaCups(config.cups_url, buf);
    } else {
      await sendToPrinter(config.ip, config.port, buf);
    }

    res.json({ success: true, message: "Resumen enviado a la impresora" });
  } catch (error) {
    console.error("PRINT SUMMARY ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error al imprimir" });
  }
};

const sendToConfiguredPrinter = async (config, bytes) => {
  const buf = Buffer.from(bytes);
  if (config.cups_url) {
    await sendViaCups(config.cups_url, buf);
  } else {
    await sendToPrinter(config.ip, config.port, buf);
  }
};

/** POST /print/kitchen-ticket  —  print kitchen ticket for open order
 *  Body: { saleId, targets?: ('kitchen'|'bar')[] }
 *  Omitting targets sends to both (backward-compat).
 *  Mode is auto-detected: if no bar printer is configured, single-printer mode
 *  routes all filtered items to the kitchen printer. */
export const printKitchenTicket = async (req, res) => {
  try {
    const { saleId } = req.body ?? {};
    if (!saleId) {
      return res.status(400).json({ success: false, message: "saleId requerido" });
    }

    const rawTargets = req.body?.targets;
    const targets    = Array.isArray(rawTargets) ? rawTargets : ['kitchen', 'bar'];

    const kitchenConfig = await getPrinterConfigFromDb();
    const barConfig     = await getBarPrinterConfigFromDb();
    const mode          = await getPrinterModeFromDb();

    if (!kitchenConfig && !barConfig) {
      return res.status(503).json({ success: false, message: "Ninguna impresora configurada" });
    }

    const sale = await getSaleByIdService(saleId);
    if (!sale) {
      return res.status(404).json({ success: false, message: "Orden no encontrada" });
    }

    const allItems = sale.items ?? [];
    const baseTicket = {
      reference:  `ORDEN #${sale.monthly_number ?? sale.id} - ${sale.reference || ""}`,
      created_at: sale.created_at,
      notes:      sale.notes,
    };
    const toTicketItems = (items) =>
      items.map(i => ({ name: i.name, quantity: i.quantity, notes: i.notes }));

    // Single mode if explicitly set, OR there is no bar printer configured.
    const singleMode = mode === "single" || !barConfig;

    if (singleMode) {
      if (!kitchenConfig) {
        return res.status(503).json({ success: false, message: "Impresora no configurada" });
      }

      const sendKitchen = targets.includes('kitchen');
      const sendBar     = targets.includes('bar');

      let filtered;
      if (sendKitchen && sendBar) {
        filtered = allItems;
      } else if (sendKitchen) {
        filtered = allItems.filter(i => (i.printer_target ?? 'kitchen') !== 'bar');
      } else {
        filtered = allItems.filter(i => i.printer_target === 'bar');
      }

      if (filtered.length === 0) {
        const label = (sendKitchen && !sendBar) ? "comida" : (!sendKitchen && sendBar) ? "bebidas" : "ítems";
        return res.json({ success: true, message: `Sin ${label} en esta orden` });
      }

      const bytes = buildEscPosKitchenTicketBytes({ ...baseTicket, items: toTicketItems(filtered) }, kitchenConfig);
      await sendToConfiguredPrinter(kitchenConfig, bytes);
      return res.json({ success: true, message: "Ticket enviado a impresora" });
    }

    /* ── Dual-printer mode ─────────────────────────────────── */
    const sendKitchen  = targets.includes('kitchen');
    const sendBar      = targets.includes('bar');
    const kitchenItems = allItems.filter(i => (i.printer_target ?? 'kitchen') !== 'bar');
    const barItems     = allItems.filter(i => i.printer_target === 'bar');

    const errors = [];

    if (sendKitchen && kitchenItems.length > 0 && kitchenConfig) {
      try {
        const bytes = buildEscPosKitchenTicketBytes({ ...baseTicket, items: toTicketItems(kitchenItems) }, kitchenConfig);
        await sendToConfiguredPrinter(kitchenConfig, bytes);
      } catch (err) {
        errors.push(err.message || "Error al imprimir en cocina");
      }
    }

    if (sendBar && barItems.length > 0 && barConfig) {
      try {
        const bytes = buildEscPosKitchenTicketBytes({ ...baseTicket, items: toTicketItems(barItems) }, barConfig);
        await sendToConfiguredPrinter(barConfig, bytes);
      } catch (err) {
        errors.push(err.message || "Error al imprimir en barra");
      }
    }

    if (errors.length > 0) {
      return res.status(503).json({ success: false, message: errors.join(" / ") });
    }

    res.json({ success: true, message: "Ticket(s) enviado(s)" });
  } catch (error) {
    console.error("PRINT KITCHEN TICKET ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error al imprimir" });
  }
};

const sendToPrinter = (host, port, data) =>
  new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled  = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(wrapConnectionError(err));
    };
    const done = () => { if (!settled) { settled = true; resolve(); } };

    socket.setTimeout(5000);
    socket.setNoDelay(true);
    socket.once("error",   fail);
    socket.once("timeout", () => fail(Object.assign(new Error("Tiempo de espera agotado con la impresora"), { isConnectionError: true })));
    socket.once("close",   done);
    socket.connect(Number(port) || 9100, host, () => socket.end(data));
  });

/** POST /print/test  —  send a test page to verify printer connectivity */
export const printTest = async (req, res) => {
  try {
    const isBar = req.body?.printer === 'bar';
    const mode  = await getPrinterModeFromDb();

    // In single mode, "bar" maps to the kitchen printer — there is only one.
    let config;
    if (isBar && mode === "dual") {
      config = await getBarPrinterConfigFromDb();
    } else {
      config = await getPrinterConfigFromDb();
    }

    if (!config) {
      const label = isBar && mode === "dual"
        ? "Impresora barra no configurada"
        : "Impresora no configurada";
      return res.status(503).json({ success: false, message: `${label} — guarda la configuración primero` });
    }

    const now = new Date().toLocaleString("es-GT", { timeZone: "America/Guatemala" });
    const connection = config.cups_url
      ? `CUPS ${config.cups_url}`
      : `TCP ${config.ip}:${config.port || 9100}`;

    const bytes = Buffer.from(buildEscPosTestPageBytes(config, { now, connection }));

    if (config.cups_url) {
      await sendViaCups(config.cups_url, bytes);
    } else {
      await sendToPrinter(config.ip, config.port, bytes);
    }

    res.json({ success: true, message: "Página de prueba enviada" });
  } catch (error) {
    console.error("PRINT TEST ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error al imprimir prueba" });
  }
};
