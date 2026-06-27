import nodemailer from "nodemailer";
import db from "../config/db.js";
import { enqueueEmail, verifyConnection, resetTransport, makeLookup, insertEmailLog } from "./email-outbox.service.js";

const EMAIL_CONFIG_KEY = "email_alert_config";
const PRODUCT_ALERT_PREFIX = "email_stock_alert_state_";
const STOCK_ALERT_THRESHOLDS_KEY = "stock_alert_thresholds";

const getRows = (result) => {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
};

const defaultConfig = {
  enabled: false,
  lowStockAlerts: true,
  criticalStockAlerts: true,
  includePdfSummary: true,
  smtpHost: "",
  smtpPort: 587,
  secureConnection: false,
  smtpUser: "",
  smtpPassword: "",
  senderName: "TU EMPRESA POS",
  senderEmail: "",
  receiverEmail: "",
  ccEmails: "",
  subjectPrefix: "TU EMPRESA ALERTA",
  dnsEnabled: false,
  dnsServers: "1.1.1.1,1.0.0.1",
};

const defaultStockThresholds = {
  lowStock: 15,
  criticalStock: 5,
};

const parseJson = (value, fallback = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const toBool = (value) => value === true || value === "true" || value === 1 || value === "1";

const normalizeConfig = (value = {}) => ({
  ...defaultConfig,
  ...value,
  enabled:              toBool(value.enabled),
  lowStockAlerts:       toBool(value.lowStockAlerts ?? true),
  criticalStockAlerts:  toBool(value.criticalStockAlerts ?? true),
  includePdfSummary:    toBool(value.includePdfSummary ?? true),
  secureConnection:     toBool(value.secureConnection),
  smtpPort:             Number(value.smtpPort || 587),
  dnsEnabled:           toBool(value.dnsEnabled),
  dnsServers:           String(value.dnsServers ?? "1.1.1.1,1.0.0.1"),
});

const normalizeStockThresholds = (value = {}) => {
  const lowStock = Math.max(
    1,
    Number(value.lowStock ?? defaultStockThresholds.lowStock) || defaultStockThresholds.lowStock
  );
  const criticalCandidate = Math.max(
    0,
    Number(value.criticalStock ?? defaultStockThresholds.criticalStock) || defaultStockThresholds.criticalStock
  );

  return {
    lowStock,
    criticalStock: Math.min(criticalCandidate, lowStock),
  };
};

const getStockThresholds = async () => {
  const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [STOCK_ALERT_THRESHOLDS_KEY]);
  const rows = getRows(result);

  if (rows.length === 0 || !rows[0]?.value) {
    return defaultStockThresholds;
  }

  return normalizeStockThresholds(parseJson(rows[0].value, defaultStockThresholds));
};

const getAlertLevel = (stock, thresholds = defaultStockThresholds) => {
  const numericStock = Number(stock || 0);

  if (numericStock <= thresholds.criticalStock) return "critical";
  if (numericStock <= thresholds.lowStock)      return "low";
  return "normal";
};

const getAlertStateKey = (productId) => `${PRODUCT_ALERT_PREFIX}${productId}`;

const getMailTransport = (config) => {
  const lookup = makeLookup(config);
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: Number(config.smtpPort || 587),
    secure: Boolean(config.secureConnection),
    family: 4,
    ...(lookup && { lookup }),
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    tls: { servername: config.smtpHost },
    auth: {
      user: config.smtpUser,
      pass: config.smtpPassword,
    },
  });
};

const buildRecipientList = (config) => {
  const cc = String(config.ccEmails || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  return { to: config.receiverEmail, cc };
};

export const getEmailAlertConfigService = async () => {
  const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [EMAIL_CONFIG_KEY]);
  const rows = getRows(result);

  if (rows.length === 0) {
    return defaultConfig;
  }

  return normalizeConfig(parseJson(rows[0].value, defaultConfig));
};

export const saveEmailAlertConfigService = async (payload) => {
  const config = normalizeConfig(payload);

  await db.query(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [EMAIL_CONFIG_KEY, JSON.stringify(config)]
  );

  // Invalidar el transport poolado para que el worker use las nuevas credenciales
  resetTransport();

  // Verificar conectividad en background; no bloquea el guardado
  if (config.enabled && config.smtpHost && config.smtpUser && config.smtpPassword) {
    verifyConnection(config).catch(err =>
      console.warn("[email] SMTP no verificado tras guardar config:", err.message)
    );
  }

  return config;
};

export const sendEmailAlertTestService = async () => {
  const config = await getEmailAlertConfigService();

  if (!config.enabled) {
    throw new Error("Activa el módulo de correo antes de enviar una prueba");
  }

  if (!config.smtpHost || !config.smtpUser || !config.smtpPassword || !config.senderEmail || !config.receiverEmail) {
    throw new Error("Completa la configuración SMTP y los correos requeridos");
  }

  // Verificar conectividad antes de intentar enviar
  await verifyConnection(config);

  const senderMismatch =
    config.senderEmail &&
    config.smtpUser &&
    config.senderEmail.toLowerCase() !== config.smtpUser.toLowerCase();

  if (senderMismatch) {
    console.warn(
      `[email] senderEmail (${config.senderEmail}) ≠ smtpUser (${config.smtpUser}). ` +
      "Gmail reescribirá el From; correos a Yahoo/Outlook pueden ir a spam."
    );
  }

  const transport  = getMailTransport(config);
  const recipients = buildRecipientList(config);
  const subject    = `${config.subjectPrefix} - Prueba de conexión`;
  const dnsInfo    = config.dnsEnabled
    ? String(config.dnsServers).split(",").map(s => s.trim()).filter(Boolean).join(",") || null
    : null;

  const t0 = Date.now();
  try {
    await transport.sendMail({
      from:    `"${config.senderName}" <${config.senderEmail}>`,
      to:      recipients.to,
      cc:      recipients.cc,
      subject,
      text: [
        "Prueba de correo desde TU EMPRESA POS.",
        "",
        "La configuración SMTP está funcionando correctamente.",
        `Fecha: ${new Date().toLocaleString()}`,
        senderMismatch
          ? `\nAVISO: El remitente configurado (${config.senderEmail}) es distinto al usuario SMTP (${config.smtpUser}). Gmail reescribirá el campo From; verifica que el correo llegó correctamente.`
          : "",
      ].join("\n"),
    });
    await insertEmailLog({ event: "test_ok", to_addr: recipients.to, subject, duration_ms: Date.now() - t0, dns_used: dnsInfo });
  } catch (err) {
    await insertEmailLog({ event: "test_fail", to_addr: recipients.to, subject, error_code: err?.code ?? null, error_msg: String(err?.message ?? err).slice(0, 500), duration_ms: Date.now() - t0, dns_used: dnsInfo });
    throw err;
  }

  return { success: true, senderMismatch };
};

const getAlertedProductsState = async (productIds = []) => {
  if (!productIds.length) return {};

  // Build individual ? per id — toPostgresParams in db.js converts them to $N
  const placeholders = productIds.map(() => "?").join(",");
  const keys = productIds.map(getAlertStateKey);

  const result = await db.query(
    `SELECT key, value FROM settings WHERE key IN (${placeholders})`,
    keys
  );

  return getRows(result).reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
};

const persistProductAlertState = async (productId, level) => {
  const key = getAlertStateKey(productId);

  if (level === "normal") {
    await db.query(`DELETE FROM settings WHERE key = ?`, [key]);
    return;
  }

  await db.query(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, level]
  );
};

export const syncProductAlertStateService = async (product) => {
  if (!product?.id) return;
  const thresholds = await getStockThresholds();
  await persistProductAlertState(product.id, getAlertLevel(product.stock, thresholds));
};

const getCurrentAlertInventory = async () => {
  const thresholds = await getStockThresholds();

  const result = await db.query(
    `SELECT
       p.id,
       p.name,
       p.stock,
       CASE
         WHEN parent.id IS NOT NULL THEN parent.name
         ELSE c.name
       END AS category,
       CASE
         WHEN parent.id IS NOT NULL THEN c.name
         ELSE ''
       END AS subcategory
     FROM products p
     LEFT JOIN categories c      ON c.id      = p.category_id
     LEFT JOIN categories parent ON parent.id = c.parent_id
     WHERE p.is_active = 1
       AND p.stock <= ?
     ORDER BY p.stock ASC, p.name ASC`,
    [thresholds.lowStock]
  );

  const rows = getRows(result).map((row) => ({
    id:         Number(row.id),
    name:       row.name,
    stock:      Number(row.stock),
    category:   row.category   || "Sin categoría",
    subcategory:row.subcategory || "",
    level:      getAlertLevel(row.stock, thresholds),
  }));

  return {
    all:      rows,
    low:      rows.filter((row) => row.level === "low" || row.level === "critical"),
    critical: rows.filter((row) => row.level === "critical"),
  };
};

const buildInventoryAlertText = (title, products) => {
  const lines = products.map((product) => {
    const categoryPath = product.subcategory
      ? `${product.category} / ${product.subcategory}`
      : product.category;
    return `- ${product.name} (${categoryPath}): stock ${product.stock}`;
  });
  return [title, "", ...lines].join("\n");
};

export const processInventoryAlertsService = async () => {
  const config     = await getEmailAlertConfigService();
  const thresholds = await getStockThresholds();

  if (!config.enabled) return { sent: false, reason: "disabled" };

  if (!config.smtpHost || !config.smtpUser || !config.smtpPassword || !config.senderEmail || !config.receiverEmail) {
    return { sent: false, reason: "missing_config" };
  }

  const inventory       = await getCurrentAlertInventory();
  const currentProducts = inventory.all;
  const stateMap        = await getAlertedProductsState(currentProducts.map((p) => p.id));

  const lowTriggered = inventory.low.some((product) => {
    const previous = stateMap[getAlertStateKey(product.id)] || "normal";
    return product.level === "low" && previous === "normal";
  });

  const criticalTriggered = inventory.critical.some((product) => {
    const previous = stateMap[getAlertStateKey(product.id)] || "normal";
    return previous !== "critical";
  });

  const mailsToSend = [];

  if (config.lowStockAlerts && lowTriggered && inventory.low.length > 0) {
    mailsToSend.push({
      subject: `${config.subjectPrefix} - Stock bajo detectado`,
      text: buildInventoryAlertText("Productos actualmente en stock bajo o crítico:", inventory.low),
    });
  }

  if (config.criticalStockAlerts && criticalTriggered && inventory.low.length > 0) {
    mailsToSend.push({
      subject: `${config.subjectPrefix} - Stock crítico detectado`,
      text: buildInventoryAlertText("Productos actualmente en estado naranja y rojo:", inventory.low),
    });
  }

  if (mailsToSend.length === 0) {
    // Aún sin mails: actualizar estado de los productos que ya están en normal
    for (const product of currentProducts) {
      await persistProductAlertState(product.id, product.level);
    }
    const allActive = await db.query(`SELECT id, stock FROM products WHERE is_active = 1`);
    for (const row of getRows(allActive)) {
      if (Number(row.stock) > thresholds.lowStock) {
        await persistProductAlertState(Number(row.id), "normal");
      }
    }
    return { sent: false, reason: "no_changes" };
  }

  const recipients = buildRecipientList(config);

  // Encolar en outbox; si falla la BD aquí, el estado NO se persiste y el próximo trigger reintentará
  for (const mail of mailsToSend) {
    await enqueueEmail({
      to:      recipients.to,
      cc:      recipients.cc,
      subject: mail.subject,
      body:    mail.text,
    });
  }

  // Estado se persiste solo DESPUÉS de encolar con éxito
  for (const product of currentProducts) {
    await persistProductAlertState(product.id, product.level);
  }

  const allActive = await db.query(`SELECT id, stock FROM products WHERE is_active = 1`);
  for (const row of getRows(allActive)) {
    if (Number(row.stock) > thresholds.lowStock) {
      await persistProductAlertState(Number(row.id), "normal");
    }
  }

  return { sent: true, queued: mailsToSend.length };
};
