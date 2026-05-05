import db from "../config/db.js";
import {
  getEmailAlertConfigService,
  saveEmailAlertConfigService,
  sendEmailAlertTestService,
} from "../services/email-alert.service.js";

const PRINTER_CONFIG_KEY     = "printer_config";
const PRINTER_CONFIG_BAR_KEY = "printer_config_bar";
const PRINTER_MODE_KEY       = "printer_mode";
const TOUCH_KEYBOARD_KEY     = "touch_keyboard_config";
const STOCK_ALERT_THRESHOLDS_KEY = "stock_alert_thresholds";

const normalizePrinterMode = (raw) =>
  String(raw || "").toLowerCase() === "dual" ? "dual" : "single";

const defaultTouchKeyboardConfig = {
  enabled: true,
};

const normalizeTouchKeyboardConfig = (value = {}) => ({
  ...defaultTouchKeyboardConfig,
  enabled: Boolean(value.enabled),
});

const defaultStockAlertThresholds = {
  lowStock: 15,
  criticalStock: 5,
};

const normalizeStockAlertThresholds = (value = {}) => {
  const lowStock = Math.max(1, Number(value.lowStock ?? defaultStockAlertThresholds.lowStock) || defaultStockAlertThresholds.lowStock);
  const criticalCandidate = Math.max(0, Number(value.criticalStock ?? defaultStockAlertThresholds.criticalStock) || defaultStockAlertThresholds.criticalStock);
  const criticalStock = Math.min(criticalCandidate, lowStock);

  return {
    lowStock,
    criticalStock,
  };
};

const clampMm = (v, min = 0, max = 20) => Math.min(max, Math.max(min, Number(v) || 0));
const clampLines = (v, max = 4) => String(v ?? "").split("\n").slice(0, max).join("\n").slice(0, 200);

const DEFAULT_PRINTER_CONFIG = {
  ip: "", port: "9100", cups_url: "", width_mm: "80",
  margin_top_mm: 1, margin_bottom_mm: 3,
  margin_left_mm: 2, margin_right_mm: 2,
  header_text: "", footer_text: "",
  logo_data_url: "",
};

export const getPrinterConfig = async (_req, res) => {
  try {
    const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [PRINTER_CONFIG_KEY]);
    const rows = result.rows ?? [];
    let data = { ...DEFAULT_PRINTER_CONFIG };
    if (rows.length > 0 && rows[0]?.value) {
      try { data = { ...data, ...JSON.parse(rows[0].value) }; } catch { /* keep default */ }
    }
    return res.json({ success: true, data });
  } catch (error) {
    console.error("GET PRINTER CONFIG ERROR:", error);
    return res.status(500).json({ success: false, message: "Error obteniendo configuración de impresora" });
  }
};

export const updatePrinterConfig = async (req, res) => {
  try {
    const b = req.body ?? {};
    const logoRaw = String(b.logo_data_url ?? "");
    if (logoRaw && !logoRaw.startsWith("data:image/")) {
      return res.status(400).json({ success: false, message: "Formato de logo inválido" });
    }
    if (logoRaw.length > 200_000) {
      return res.status(400).json({ success: false, message: "Logo demasiado grande (máx ~150KB)" });
    }
    const config = {
      ip:              String(b.ip ?? "").trim(),
      port:            String(b.port ?? "9100"),
      cups_url:        String(b.cups_url ?? "").trim(),
      width_mm:        String(b.width_mm ?? "80"),
      margin_top_mm:    clampMm(b.margin_top_mm),
      margin_bottom_mm: clampMm(b.margin_bottom_mm),
      margin_left_mm:   clampMm(b.margin_left_mm),
      margin_right_mm:  clampMm(b.margin_right_mm),
      header_text:     clampLines(b.header_text),
      footer_text:     clampLines(b.footer_text),
      logo_data_url:   logoRaw,
    };
    await db.query(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [PRINTER_CONFIG_KEY, JSON.stringify(config)]
    );
    return res.json({ success: true, data: config });
  } catch (error) {
    console.error("SAVE PRINTER CONFIG ERROR:", error);
    return res.status(500).json({ success: false, message: "Error guardando configuración de impresora" });
  }
};

const DEFAULT_BAR_PRINTER_CONFIG = {
  ip: "", port: "9100", cups_url: "", width_mm: "80",
};

export const getBarPrinterConfig = async (_req, res) => {
  try {
    const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [PRINTER_CONFIG_BAR_KEY]);
    const rows = result.rows ?? [];
    let data = { ...DEFAULT_BAR_PRINTER_CONFIG };
    if (rows.length > 0 && rows[0]?.value) {
      try { data = { ...data, ...JSON.parse(rows[0].value) }; } catch { /* keep default */ }
    }
    return res.json({ success: true, data });
  } catch (error) {
    console.error("GET BAR PRINTER CONFIG ERROR:", error);
    return res.status(500).json({ success: false, message: "Error obteniendo configuración de impresora barra" });
  }
};

export const updateBarPrinterConfig = async (req, res) => {
  try {
    const b = req.body ?? {};
    const config = {
      ip:       String(b.ip       ?? "").trim(),
      port:     String(b.port     ?? "9100"),
      cups_url: String(b.cups_url ?? "").trim(),
      width_mm: String(b.width_mm ?? "80"),
    };
    await db.query(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [PRINTER_CONFIG_BAR_KEY, JSON.stringify(config)]
    );
    return res.json({ success: true, data: config });
  } catch (error) {
    console.error("SAVE BAR PRINTER CONFIG ERROR:", error);
    return res.status(500).json({ success: false, message: "Error guardando configuración de impresora barra" });
  }
};

export const getTipPercentage = async (req, res) => {
  try {
    const result = await db.query(`SELECT value FROM settings WHERE key = ?`, ["tip_percentage"]);
    const rows = result.rows ?? [];
    const value = rows.length > 0 ? Number(rows[0].value) : 15;

    return res.json({ success: true, value });
  } catch (error) {
    console.error("GET TIP ERROR:", error);
    return res.status(500).json({ success: false, message: "Error obteniendo propina" });
  }
};

export const updateTipPercentage = async (req, res) => {
  try {
    const { value } = req.body;

    if (value === undefined || value === null || value === "") {
      return res.status(400).json({ success: false, message: "Valor requerido" });
    }

    const tip = Number(value);

    if (!Number.isFinite(tip) || tip < 0 || tip > 100) {
      return res.status(400).json({ success: false, message: "La propina debe estar entre 0 y 100" });
    }

    await db.query(
      `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      ["tip_percentage", String(tip)]
    );

    return res.json({ success: true, value: tip });
  } catch (error) {
    console.error("SAVE TIP ERROR:", error);
    return res.status(500).json({ success: false, message: "Error guardando propina" });
  }
};

export const getEmailAlertConfig = async (req, res) => {
  try {
    const config = await getEmailAlertConfigService();
    return res.json({ success: true, data: config });
  } catch (error) {
    console.error("GET EMAIL ALERT CONFIG ERROR:", error);
    return res.status(500).json({ success: false, message: "Error obteniendo configuración de correo" });
  }
};

export const updateEmailAlertConfig = async (req, res) => {
  try {
    const config = await saveEmailAlertConfigService(req.body || {});
    return res.json({ success: true, data: config });
  } catch (error) {
    console.error("SAVE EMAIL ALERT CONFIG ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Error guardando configuración de correo" });
  }
};

export const sendEmailAlertTest = async (req, res) => {
  try {
    const result = await sendEmailAlertTestService();
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error("EMAIL ALERT TEST ERROR:", error);
    return res.status(400).json({ success: false, message: error.message || "Error enviando correo de prueba" });
  }
};

export const getEmailLogs = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const result = await db.query(
      `SELECT id, created_at, event, to_addr, subject, error_code, error_msg, duration_ms, dns_used
       FROM email_log
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );
    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("GET EMAIL LOGS ERROR:", error);
    return res.status(500).json({ success: false, message: "Error obteniendo logs de correo" });
  }
};

export const getTouchKeyboardConfig = async (_req, res) => {
  try {
    const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [TOUCH_KEYBOARD_KEY]);
    const rows = result.rows ?? [];

    if (rows.length === 0 || !rows[0]?.value) {
      return res.json({ success: true, data: defaultTouchKeyboardConfig });
    }

    let parsedValue = defaultTouchKeyboardConfig;

    try {
      parsedValue = JSON.parse(rows[0].value);
    } catch {
      parsedValue = defaultTouchKeyboardConfig;
    }

    return res.json({ success: true, data: normalizeTouchKeyboardConfig(parsedValue) });
  } catch (error) {
    console.error("GET TOUCH KEYBOARD CONFIG ERROR:", error);
    return res.status(500).json({ success: false, message: "Error obteniendo configuración del teclado táctil" });
  }
};

export const updateTouchKeyboardConfig = async (req, res) => {
  try {
    const config = normalizeTouchKeyboardConfig(req.body || {});

    await db.query(
      `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      [TOUCH_KEYBOARD_KEY, JSON.stringify(config)]
    );

    return res.json({ success: true, data: config });
  } catch (error) {
    console.error("SAVE TOUCH KEYBOARD CONFIG ERROR:", error);
    return res.status(500).json({ success: false, message: "Error guardando configuración del teclado táctil" });
  }
};

export const getPrinterMode = async (_req, res) => {
  try {
    const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [PRINTER_MODE_KEY]);
    const rows = result.rows ?? [];
    const mode = rows.length > 0 ? normalizePrinterMode(rows[0].value) : "single";
    return res.json({ success: true, data: { mode } });
  } catch (error) {
    console.error("GET PRINTER MODE ERROR:", error);
    return res.status(500).json({ success: false, message: "Error obteniendo modo de impresoras" });
  }
};

export const updatePrinterMode = async (req, res) => {
  try {
    const mode = normalizePrinterMode(req.body?.mode);
    await db.query(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [PRINTER_MODE_KEY, mode]
    );
    return res.json({ success: true, data: { mode } });
  } catch (error) {
    console.error("SAVE PRINTER MODE ERROR:", error);
    return res.status(500).json({ success: false, message: "Error guardando modo de impresoras" });
  }
};

export const getStockAlertThresholds = async (_req, res) => {
  try {
    const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [STOCK_ALERT_THRESHOLDS_KEY]);
    const rows = result.rows ?? [];

    if (rows.length === 0 || !rows[0]?.value) {
      return res.json({ success: true, data: defaultStockAlertThresholds });
    }

    let parsedValue = defaultStockAlertThresholds;

    try {
      parsedValue = JSON.parse(rows[0].value);
    } catch {
      parsedValue = defaultStockAlertThresholds;
    }

    return res.json({ success: true, data: normalizeStockAlertThresholds(parsedValue) });
  } catch (error) {
    console.error("GET STOCK THRESHOLDS ERROR:", error);
    return res.status(500).json({ success: false, message: "Error obteniendo límites de stock" });
  }
};

export const updateStockAlertThresholds = async (req, res) => {
  try {
    const config = normalizeStockAlertThresholds(req.body || {});

    await db.query(
      `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      [STOCK_ALERT_THRESHOLDS_KEY, JSON.stringify(config)]
    );

    return res.json({ success: true, data: config });
  } catch (error) {
    console.error("SAVE STOCK THRESHOLDS ERROR:", error);
    return res.status(500).json({ success: false, message: "Error guardando límites de stock" });
  }
};
