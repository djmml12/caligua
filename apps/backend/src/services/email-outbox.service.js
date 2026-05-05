import nodemailer from "nodemailer";
import { Resolver } from "node:dns/promises";
import db from "../config/db.js";

const EMAIL_CONFIG_KEY = "email_alert_config";

const getRows = (r) => {
  if (Array.isArray(r)) return r;
  if (r?.rows) return r.rows;
  return [];
};

// ── DNS custom lookup (solo afecta al transport de email, no al proceso) ─────

export function makeLookup(config) {
  if (!config?.dnsEnabled || !config?.dnsServers) return undefined;
  const servers = String(config.dnsServers).split(",").map(s => s.trim()).filter(Boolean);
  if (!servers.length) return undefined;
  const resolver = new Resolver();
  resolver.setServers(servers);
  return (hostname, options, callback) => {
    const family = (typeof options === "object" ? options?.family : options) || 4;
    const method = family === 6 ? "resolve6" : "resolve4";
    resolver[method](hostname)
      .then(addrs => callback(null, addrs[0], family))
      .catch(callback);
  };
}

function dnsLabel(config) {
  if (!config?.dnsEnabled || !config?.dnsServers) return null;
  return String(config.dnsServers).split(",").map(s => s.trim()).filter(Boolean).join(",") || null;
}

// ── Persistent log ────────────────────────────────────────────────────────────

export async function insertEmailLog({ event, to_addr = null, subject = null, error_code = null, error_msg = null, duration_ms = null, dns_used = null }) {
  try {
    await db.query(
      `INSERT INTO email_log (event, to_addr, subject, error_code, error_msg, duration_ms, dns_used)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [event, to_addr, subject, error_code, error_msg, duration_ms, dns_used]
    );
  } catch { /* no bloquear el flujo principal */ }
}

// ── Pooled transport (singleton, rebuilt on config change) ────────────────────

let _transport    = null;
let _transportKey = "";

function buildTransport(config) {
  const lookup = makeLookup(config);
  return nodemailer.createTransport({
    host:              config.smtpHost,
    port:              Number(config.smtpPort || 587),
    secure:            Boolean(config.secureConnection),
    family:            4,
    ...(lookup && { lookup }),
    pool:              true,
    maxConnections:    1,
    maxMessages:       100,
    rateDelta:         60_000,
    rateLimit:         15,
    connectionTimeout: 15_000,
    greetingTimeout:   15_000,
    socketTimeout:     30_000,
    tls: { servername: config.smtpHost },
    auth: { user: config.smtpUser, pass: config.smtpPassword },
  });
}

function getTransport(config) {
  const key = `${config.smtpHost}:${config.smtpPort}:${config.smtpUser}`;
  if (_transport && _transportKey === key) return _transport;
  if (_transport) try { _transport.close(); } catch {}
  _transport    = buildTransport(config);
  _transportKey = key;
  return _transport;
}

export function resetTransport() {
  if (_transport) { try { _transport.close(); } catch {} _transport = null; _transportKey = ""; }
}

// ── One-off verify (no pool, cierra sola) ─────────────────────────────────────

export async function verifyConnection(config) {
  const lookup = makeLookup(config);
  const t = nodemailer.createTransport({
    host:              config.smtpHost,
    port:              Number(config.smtpPort || 587),
    secure:            Boolean(config.secureConnection),
    family:            4,
    ...(lookup && { lookup }),
    connectionTimeout: 10_000,
    greetingTimeout:   10_000,
    socketTimeout:     15_000,
    tls: { servername: config.smtpHost },
    auth: { user: config.smtpUser, pass: config.smtpPassword },
  });
  const t0 = Date.now();
  try {
    await t.verify();
    await insertEmailLog({ event: "verify_ok", duration_ms: Date.now() - t0, dns_used: dnsLabel(config) });
  } catch (err) {
    await insertEmailLog({
      event:       "verify_fail",
      error_code:  err?.code ?? null,
      error_msg:   String(err?.message ?? err).slice(0, 500),
      duration_ms: Date.now() - t0,
      dns_used:    dnsLabel(config),
    });
    throw err;
  } finally {
    try { t.close(); } catch {}
  }
}

// ── Enqueue ───────────────────────────────────────────────────────────────────

export async function enqueueEmail({ to, cc = [], subject, body }) {
  await db.query(
    `INSERT INTO email_outbox (to_addr, cc_addrs, subject, body)
     VALUES (?, ?, ?, ?)`,
    [to, JSON.stringify(cc), subject, body]
  );
}

// ── Error classification ──────────────────────────────────────────────────────

function isTransient(err) {
  const code = Number(err?.responseCode || 0);
  // 4xx SMTP = transient (421 rate-limit, 454 auth temp, etc.)
  if (code >= 400 && code < 500) return true;
  const netCodes = ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND", "ESOCKET"];
  if (netCodes.includes(err?.code)) return true;
  return false;
}

// ── Config reader (no import cycle) ──────────────────────────────────────────

async function getConfig() {
  const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [EMAIL_CONFIG_KEY]);
  const rows   = getRows(result);
  if (!rows.length || !rows[0]?.value) return null;
  try { return JSON.parse(rows[0].value); } catch { return null; }
}

// ── Worker tick ───────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 8;

async function tick() {
  const config = await getConfig();
  if (!config?.enabled || !config.smtpHost || !config.smtpUser || !config.smtpPassword) return;

  const result = await db.query(
    `SELECT id, to_addr, cc_addrs, subject, body, attempts
     FROM email_outbox
     WHERE status = 'pending' AND next_try_at <= NOW()
     ORDER BY created_at ASC
     LIMIT 5`
  );
  const rows = getRows(result);
  if (!rows.length) return;

  const t       = getTransport(config);
  const dnsInfo = dnsLabel(config);

  for (const row of rows) {
    let cc = [];
    try { cc = JSON.parse(row.cc_addrs || "[]"); } catch {}

    const t0 = Date.now();
    try {
      await t.sendMail({
        from:    `"${config.senderName}" <${config.senderEmail}>`,
        to:      row.to_addr,
        cc,
        subject: row.subject,
        text:    row.body,
      });
      await db.query(
        `UPDATE email_outbox SET status = 'sent', sent_at = NOW() WHERE id = ?`,
        [row.id]
      );
      await insertEmailLog({ event: "send_ok", to_addr: row.to_addr, subject: row.subject, duration_ms: Date.now() - t0, dns_used: dnsInfo });
      console.log(`[email-outbox] enviado id=${row.id} → ${row.to_addr}`);
    } catch (err) {
      const attempts = Number(row.attempts) + 1;
      const errMsg   = String(err?.message || err).slice(0, 500);
      await insertEmailLog({ event: "send_fail", to_addr: row.to_addr, subject: row.subject, error_code: err?.code ?? null, error_msg: errMsg, duration_ms: Date.now() - t0, dns_used: dnsInfo });

      if (!isTransient(err) || attempts >= MAX_ATTEMPTS) {
        await db.query(
          `UPDATE email_outbox SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?`,
          [attempts, errMsg, row.id]
        );
        console.error(`[email-outbox] fallo permanente id=${row.id}:`, errMsg);
      } else {
        // Backoff exponencial: 30s · 2^(attempt-1), tope 1h
        const delaySec = Math.min(30 * Math.pow(2, attempts - 1), 3600);
        const nextTry  = new Date(Date.now() + delaySec * 1000);
        await db.query(
          `UPDATE email_outbox SET attempts = ?, last_error = ?, next_try_at = ? WHERE id = ?`,
          [attempts, errMsg, nextTry, row.id]
        );
        console.warn(`[email-outbox] error transitorio id=${row.id} intento=${attempts}, reintento en ${delaySec}s:`, errMsg);
      }
    }
  }
}

// ── Worker lifecycle ──────────────────────────────────────────────────────────

let _timer = null;

export function startOutboxWorker() {
  if (_timer) return;
  _timer = setInterval(
    () => tick().catch(e => console.error("[email-outbox] tick error:", e)),
    15_000
  );
  // Primer ciclo 3s después del arranque
  setTimeout(() => tick().catch(() => {}), 3_000);
  console.log("📧 Email outbox worker iniciado (ciclo 15s, max 15 correos/min)");
}

export function stopOutboxWorker() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  resetTransport();
}
