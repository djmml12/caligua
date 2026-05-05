import { useEffect, useRef, useState } from "react";
import { Button, Input, useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";
import "./email-config.css";

/* ── Types ────────────────────────────────────────────────── */

interface EmailConfig {
  enabled:             boolean;
  smtpHost:            string;
  smtpPort:            number;
  secureConnection:    boolean;
  smtpUser:            string;
  smtpPassword:        string;
  senderName:          string;
  senderEmail:         string;
  receiverEmail:       string;
  ccEmails:            string;
  subjectPrefix:       string;
  lowStockAlerts:      boolean;
  criticalStockAlerts: boolean;
  dnsEnabled:          boolean;
  dnsServers:          string;
}

interface EmailLogEntry {
  id:          number;
  created_at:  string;
  event:       string;
  to_addr:     string | null;
  subject:     string | null;
  error_code:  string | null;
  error_msg:   string | null;
  duration_ms: number | null;
  dns_used:    string | null;
}

const defaults: EmailConfig = {
  enabled:             false,
  smtpHost:            "",
  smtpPort:            587,
  secureConnection:    false,
  smtpUser:            "",
  smtpPassword:        "",
  senderName:          "Tu Empresa POS",
  senderEmail:         "",
  receiverEmail:       "",
  ccEmails:            "",
  subjectPrefix:       "TU EMPRESA",
  lowStockAlerts:      true,
  criticalStockAlerts: true,
  dnsEnabled:          false,
  dnsServers:          "1.1.1.1,1.0.0.1",
};

const DNS_PRESETS = [
  { label: "Cloudflare", value: "1.1.1.1,1.0.0.1" },
  { label: "Google",     value: "8.8.8.8,8.8.4.4"  },
  { label: "Quad9",      value: "9.9.9.9"           },
];

/* ── Icons ────────────────────────────────────────────────── */

function GmailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <polyline points="2,6 12,13 22,6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

/* ── Toggle row ───────────────────────────────────────────── */

function ToggleRow({
  label, desc, checked, onChange,
}: { label: string; desc?: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="em-toggle-row">
      <div className="em-toggle-text">
        <span className="em-toggle-label">{label}</span>
        {desc && <span className="em-toggle-desc">{desc}</span>}
      </div>
      <div
        className={`em-switch${checked ? " em-switch--on" : ""}`}
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        onKeyDown={e => e.key === " " && onChange()}
        tabIndex={0}
      >
        <div className="em-switch-thumb" />
      </div>
    </label>
  );
}

/* ── Section card ─────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="em-section">
      <div className="em-section-title">{title}</div>
      {children}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────── */

export default function EmailReportsManager() {
  const { show }   = useToast();
  const mountedRef = useRef(true);

  const [config,       setConfig]       = useState<EmailConfig>(defaults);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [testing,      setTesting]      = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [logs,         setLogs]         = useState<EmailLogEntry[]>([]);
  const [logsLoading,  setLogsLoading]  = useState(false);
  const [showLogs,     setShowLogs]     = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    void apiRequest("/settings/email-alerts")
      .then((r: unknown) => {
        const d = r as Record<string, unknown>;
        const raw = (d?.data ?? d) as Record<string, unknown>;
        if (mountedRef.current) {
          setConfig({
            enabled:             Boolean(raw?.enabled),
            smtpHost:            String(raw?.smtpHost            ?? ""),
            smtpPort:            Number(raw?.smtpPort            ?? 587),
            secureConnection:    Boolean(raw?.secureConnection),
            smtpUser:            String(raw?.smtpUser            ?? ""),
            smtpPassword:        String(raw?.smtpPassword        ?? ""),
            senderName:          String(raw?.senderName          ?? "Tu Empresa POS"),
            senderEmail:         String(raw?.senderEmail         ?? ""),
            receiverEmail:       String(raw?.receiverEmail       ?? ""),
            ccEmails:            String(raw?.ccEmails            ?? ""),
            subjectPrefix:       String(raw?.subjectPrefix       ?? "TU EMPRESA"),
            lowStockAlerts:      raw?.lowStockAlerts      !== false,
            criticalStockAlerts: raw?.criticalStockAlerts !== false,
            dnsEnabled:          Boolean(raw?.dnsEnabled),
            dnsServers:          String(raw?.dnsServers          ?? "1.1.1.1,1.0.0.1"),
          });
        }
      })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoading(false); });
    return () => { mountedRef.current = false; };
  }, []);

  const set = <K extends keyof EmailConfig>(key: K, value: EmailConfig[K]) =>
    setConfig(c => ({ ...c, [key]: value }));

  const fillGmail = () =>
    setConfig(c => ({
      ...c,
      smtpHost:         "smtp.gmail.com",
      smtpPort:         587,
      secureConnection: false,
    }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest("/settings/email-alerts", {
        method: "PUT",
        body:   JSON.stringify(config),
      });
      if (mountedRef.current) show("Configuración guardada", { type: "success" });
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al guardar", { type: "error" });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await apiRequest("/settings/email-alerts/test", { method: "POST" });
      if (mountedRef.current) show("Correo de prueba enviado correctamente", { type: "success" });
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "No se pudo enviar el correo", { type: "error" });
    } finally {
      if (mountedRef.current) setTesting(false);
    }
  };

  const handleLoadLogs = async () => {
    setLogsLoading(true);
    setShowLogs(true);
    try {
      const r = await apiRequest("/settings/email-alerts/logs?limit=100") as Record<string, unknown>;
      const entries = (r?.data ?? r) as EmailLogEntry[];
      if (mountedRef.current) setLogs(Array.isArray(entries) ? entries : []);
    } catch {
      if (mountedRef.current) setLogs([]);
    } finally {
      if (mountedRef.current) setLogsLoading(false);
    }
  };

  return (
    <div className="em-shell">
      <div className="av-header">
        <h2 className="av-title">Configuración de email</h2>
      </div>

      <div className="em-scroll">
        {loading ? (
          <div className="al-stub"><span>Cargando...</span></div>
        ) : (
          <div className="em-body">

            {/* ── Master enable ──────────────────────────── */}
            <div className="em-section em-section--hero">
              <ToggleRow
                label="Activar envío de emails"
                desc="Alertas de stock y resúmenes del día"
                checked={config.enabled}
                onChange={() => set("enabled", !config.enabled)}
              />
            </div>

            {config.enabled && (
              <>
                {/* ── SMTP ───────────────────────────────── */}
                <Section title="Servidor SMTP">
                  <button className="em-gmail-btn" onClick={fillGmail} type="button">
                    <GmailIcon />
                    <span>Usar Gmail (smtp.gmail.com)</span>
                  </button>

                  <div className="em-note">
                    Google requiere una <strong>Contraseña de aplicación</strong> (no tu contraseña normal).
                    Actívala en <em>Cuenta Google → Seguridad → Verificación en dos pasos → Contraseñas de aplicación</em>.
                  </div>

                  <div className="em-grid-2">
                    <Input
                      label="Servidor SMTP"
                      value={config.smtpHost}
                      onChange={e => set("smtpHost", e.target.value)}
                      placeholder="smtp.gmail.com"
                      autoComplete="off"
                    />
                    <div className="em-port-wrap">
                      <label className="em-port-label">Puerto</label>
                      <div className="em-port-chips">
                        {([587, 465, 25] as const).map(p => (
                          <button
                            key={p}
                            type="button"
                            className={`em-port-chip${config.smtpPort === p ? " em-port-chip--active" : ""}`}
                            onClick={() => {
                              set("smtpPort", p);
                              if (p === 465) set("secureConnection", true);
                              if (p === 587) set("secureConnection", false);
                            }}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <ToggleRow
                    label="Conexión SSL/TLS"
                    desc="Activado para puerto 465 · Desactivado para 587 (STARTTLS)"
                    checked={config.secureConnection}
                    onChange={() => set("secureConnection", !config.secureConnection)}
                  />

                  <Input
                    label="Usuario SMTP (tu cuenta Gmail)"
                    type="email"
                    value={config.smtpUser}
                    onChange={e => set("smtpUser", e.target.value)}
                    placeholder="tu@gmail.com"
                    autoComplete="username"
                  />

                  <div className="em-password-wrap">
                    <Input
                      label="Contraseña de aplicación"
                      type={showPassword ? "text" : "password"}
                      value={config.smtpPassword}
                      onChange={e => set("smtpPassword", e.target.value)}
                      placeholder="xxxx xxxx xxxx xxxx"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="em-eye-btn"
                      onClick={() => setShowPassword(p => !p)}
                      aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>
                </Section>

                {/* ── Remitente / destinatario ───────────── */}
                <Section title="Remitente y destinatario">
                  <div className="em-grid-2">
                    <Input
                      label="Nombre del remitente"
                      value={config.senderName}
                      onChange={e => set("senderName", e.target.value)}
                      placeholder="Tu Empresa POS"
                    />
                    <Input
                      label="Email del remitente"
                      type="email"
                      value={config.senderEmail}
                      onChange={e => set("senderEmail", e.target.value)}
                      placeholder="tu@gmail.com"
                    />
                  </div>
                  <Input
                    label="Destinatario principal"
                    type="email"
                    value={config.receiverEmail}
                    onChange={e => set("receiverEmail", e.target.value)}
                    placeholder="gerencia@tuempresa.com"
                  />
                  <Input
                    label="Con copia (CC) — separar con comas"
                    value={config.ccEmails}
                    onChange={e => set("ccEmails", e.target.value)}
                    placeholder="contador@empresa.com, admin@empresa.com"
                  />
                  <Input
                    label="Prefijo del asunto"
                    value={config.subjectPrefix}
                    onChange={e => set("subjectPrefix", e.target.value)}
                    placeholder="TU EMPRESA"
                  />
                </Section>

                {/* ── Alertas ────────────────────────────── */}
                <Section title="Alertas de inventario">
                  <ToggleRow
                    label="Stock bajo"
                    desc="Notificar cuando un producto llega al umbral de stock bajo"
                    checked={config.lowStockAlerts}
                    onChange={() => set("lowStockAlerts", !config.lowStockAlerts)}
                  />
                  <ToggleRow
                    label="Stock crítico"
                    desc="Notificar cuando un producto llega al umbral crítico (urgente)"
                    checked={config.criticalStockAlerts}
                    onChange={() => set("criticalStockAlerts", !config.criticalStockAlerts)}
                  />
                </Section>

                {/* ── DNS personalizado ──────────────────── */}
                <Section title="DNS personalizado">
                  <ToggleRow
                    label="Usar DNS personalizado"
                    desc="Resuelve el host SMTP con tus propios servidores DNS, independiente del sistema"
                    checked={config.dnsEnabled}
                    onChange={() => set("dnsEnabled", !config.dnsEnabled)}
                  />
                  {config.dnsEnabled && (
                    <>
                      <div className="em-dns-presets">
                        {DNS_PRESETS.map(p => (
                          <button
                            key={p.label}
                            type="button"
                            className={`em-port-chip${config.dnsServers === p.value ? " em-port-chip--active" : ""}`}
                            onClick={() => set("dnsServers", p.value)}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <Input
                        label="Servidores DNS (separados por comas)"
                        value={config.dnsServers}
                        onChange={e => set("dnsServers", e.target.value)}
                        placeholder="1.1.1.1,1.0.0.1"
                        autoComplete="off"
                      />
                      <p className="em-toggle-desc" style={{ marginTop: 4 }}>
                        El DNS solo se aplica al transporte de correo, no afecta al resto del servidor.
                      </p>
                    </>
                  )}
                </Section>

                {/* ── Test ───────────────────────────────── */}
                <Section title="Probar configuración">
                  <p className="em-test-desc">
                    Envía un correo de prueba con la configuración actual. Guarda primero si hiciste cambios.
                  </p>
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    loading={testing}
                    onClick={() => void handleTest()}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <SendIcon /><span>Enviar correo de prueba</span>
                    </span>
                  </Button>
                </Section>

                {/* ── Logs ───────────────────────────────── */}
                <Section title="Logs de correo">
                  <p className="em-test-desc">
                    Registro de envíos, fallos y verificaciones. Útil para diagnosticar timeouts.
                  </p>
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    loading={logsLoading}
                    onClick={() => void handleLoadLogs()}
                  >
                    {showLogs ? "Actualizar logs" : "Ver logs de correo"}
                  </Button>
                  {showLogs && (
                    <div className="em-log-list">
                      {logsLoading ? (
                        <p className="em-log-empty">Cargando...</p>
                      ) : logs.length === 0 ? (
                        <p className="em-log-empty">Sin registros aún. Los logs aparecen tras el primer envío o prueba.</p>
                      ) : logs.map(entry => (
                        <div key={entry.id} className={`em-log-row em-log-row--${entry.event.endsWith("_ok") ? "ok" : "fail"}`}>
                          <span className="em-log-event">{entry.event}</span>
                          <span className="em-log-time">{new Date(entry.created_at).toLocaleString()}</span>
                          {entry.to_addr && <span className="em-log-to">{entry.to_addr}</span>}
                          {entry.duration_ms != null && <span className="em-log-ms">{entry.duration_ms} ms</span>}
                          {entry.dns_used && <span className="em-log-dns">DNS: {entry.dns_used}</span>}
                          {entry.error_code && <span className="em-log-err-code">{entry.error_code}</span>}
                          {entry.error_msg && <span className="em-log-err-msg">{entry.error_msg}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            )}

            {/* ── Save ───────────────────────────────────── */}
            <div className="em-save-row">
              <Button
                variant="primary"
                size="xl"
                fullWidth
                loading={saving}
                onClick={() => void handleSave()}
              >
                Guardar configuración
              </Button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
