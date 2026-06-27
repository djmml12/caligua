import { useEffect, useRef, useState } from "react";
import { Button, Input, useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";
import TicketPreview, { type TicketConfig } from "./TicketPreview";
import "./printer-config.css";

interface PrinterConfig extends TicketConfig {
  ip:       string;
  port:     string;
  cups_url: string;
}

interface BarPrinterConfig {
  ip:       string;
  port:     string;
  cups_url: string;
  width_mm: "58" | "80";
}

interface CategoryTarget {
  id:             number;
  name:           string;
  parent_name:    string | null;
  printer_target: "kitchen" | "bar";
}

const DEFAULT: PrinterConfig = {
  ip: "", port: "9100", cups_url: "", width_mm: "80",
  margin_top_mm: 3, margin_bottom_mm: 5,
  margin_left_mm: 2, margin_right_mm: 2,
  header_text: "", footer_text: "",
  logo_data_url: "",
};

const BAR_DEFAULT: BarPrinterConfig = {
  ip: "", port: "9100", cups_url: "", width_mm: "80",
};

const MAX_LOGO_BYTES = 150_000;

export default function PrinterManager() {
  const { show }    = useToast();
  const mountedRef  = useRef(true);
  const fileRef     = useRef<HTMLInputElement>(null);

  const [config,         setConfig]         = useState<PrinterConfig>(DEFAULT);
  const [barConfig,      setBarConfig]      = useState<BarPrinterConfig>(BAR_DEFAULT);
  const [mode,           setMode]           = useState<"single" | "dual">("single");
  const [categories,     setCategories]     = useState<CategoryTarget[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [savingBar,      setSavingBar]      = useState(false);
  const [savingMode,     setSavingMode]     = useState(false);
  const [testing,        setTesting]        = useState(false);
  const [testingBar,     setTestingBar]     = useState(false);
  const [savingTargets,  setSavingTargets]  = useState(false);

  useEffect(() => {
    mountedRef.current = true;

    const loadAll = async () => {
      try {
        const [kitchenRes, barRes, modeRes, catsRes] = await Promise.all([
          apiRequest("/settings/printer")      as Promise<Record<string, unknown>>,
          apiRequest("/settings/printer-bar")  as Promise<Record<string, unknown>>,
          apiRequest("/settings/printer-mode") as Promise<Record<string, unknown>>,
          apiRequest("/categories?includeInactive=true") as Promise<unknown>,
        ]);

        if (mountedRef.current) {
          const inner = ((kitchenRes?.data ?? kitchenRes) as Record<string, unknown>);
          setConfig(prev => ({
            ...prev,
            ip:               String(inner?.ip               ?? prev.ip),
            port:             String(inner?.port             ?? prev.port),
            cups_url:         String(inner?.cups_url         ?? prev.cups_url),
            width_mm:         String(inner?.width_mm         ?? prev.width_mm) as "58" | "80",
            margin_top_mm:    Number(inner?.margin_top_mm    ?? prev.margin_top_mm),
            margin_bottom_mm: Number(inner?.margin_bottom_mm ?? prev.margin_bottom_mm),
            margin_left_mm:   Number(inner?.margin_left_mm   ?? prev.margin_left_mm),
            margin_right_mm:  Number(inner?.margin_right_mm  ?? prev.margin_right_mm),
            header_text:      String(inner?.header_text      ?? prev.header_text),
            footer_text:      String(inner?.footer_text      ?? prev.footer_text),
            logo_data_url:    String(inner?.logo_data_url    ?? prev.logo_data_url),
          }));

          const barInner = ((barRes?.data ?? barRes) as Record<string, unknown>);
          setBarConfig(prev => ({
            ip:       String(barInner?.ip       ?? prev.ip),
            port:     String(barInner?.port     ?? prev.port),
            cups_url: String(barInner?.cups_url ?? prev.cups_url),
            width_mm: (String(barInner?.width_mm ?? prev.width_mm) as "58" | "80"),
          }));

          const modeInner = (modeRes?.data ?? modeRes) as Record<string, unknown>;
          setMode(modeInner?.mode === "dual" ? "dual" : "single");

          const rawCats = Array.isArray(catsRes) ? catsRes : [];
          setCategories(
            (rawCats as Record<string, unknown>[])
              .filter(c => !c.parent_id)
              .map(c => ({
                id:             Number(c.id),
                name:           String(c.name),
                parent_name:    c.parent_name ? String(c.parent_name) : null,
                printer_target: c.printer_target === "bar" ? "bar" : "kitchen",
              }))
          );
        }
      } catch {
        /* ignore */
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    void loadAll();
    return () => { mountedRef.current = false; };
  }, []);

  const set    = <K extends keyof PrinterConfig>(key: K, val: PrinterConfig[K]) =>
    setConfig(c => ({ ...c, [key]: val }));
  const setBar = <K extends keyof BarPrinterConfig>(key: K, val: BarPrinterConfig[K]) =>
    setBarConfig(c => ({ ...c, [key]: val }));

  const toggleCatTarget = (id: number) =>
    setCategories(cats =>
      cats.map(c => c.id === id
        ? { ...c, printer_target: c.printer_target === "kitchen" ? "bar" : "kitchen" }
        : c
      )
    );

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      show("Solo se aceptan imágenes (PNG, JPG)", { type: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (result.length > MAX_LOGO_BYTES * 1.37) {
        show("Logo demasiado grande — máx ~110KB", { type: "error" });
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxW   = 400;
        const scale  = img.width > maxW ? maxW / img.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { set("logo_data_url", result); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        set("logo_data_url", canvas.toDataURL("image/png", 0.85));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest("/settings/printer", {
        method: "PUT",
        body: JSON.stringify({
          ip:               config.ip.trim(),
          port:             Number(config.port),
          cups_url:         config.cups_url.trim(),
          width_mm:         Number(config.width_mm),
          margin_top_mm:    config.margin_top_mm,
          margin_bottom_mm: config.margin_bottom_mm,
          margin_left_mm:   config.margin_left_mm,
          margin_right_mm:  config.margin_right_mm,
          header_text:      config.header_text,
          footer_text:      config.footer_text,
          logo_data_url:    config.logo_data_url,
        }),
      });
      if (mountedRef.current) show("Configuración guardada", { type: "success" });
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al guardar", { type: "error" });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const handleSaveBar = async () => {
    setSavingBar(true);
    try {
      await apiRequest("/settings/printer-bar", {
        method: "PUT",
        body: JSON.stringify({
          ip:       barConfig.ip.trim(),
          port:     Number(barConfig.port),
          cups_url: barConfig.cups_url.trim(),
          width_mm: Number(barConfig.width_mm),
        }),
      });
      if (mountedRef.current) show("Impresora barra guardada", { type: "success" });
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al guardar", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingBar(false);
    }
  };

  const handleTestPrint = async () => {
    setTesting(true);
    try {
      await apiRequest("/print/test", { method: "POST" });
      show("Página de prueba enviada a cocina", { type: "success" });
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al imprimir prueba", { type: "error" });
    } finally {
      if (mountedRef.current) setTesting(false);
    }
  };

  const handleTestBar = async () => {
    setTestingBar(true);
    try {
      await apiRequest("/print/test", { method: "POST", body: JSON.stringify({ printer: "bar" }) });
      show("Página de prueba enviada a barra", { type: "success" });
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al imprimir prueba", { type: "error" });
    } finally {
      if (mountedRef.current) setTestingBar(false);
    }
  };

  const handleChangeMode = async (next: "single" | "dual") => {
    if (next === mode) return;
    setSavingMode(true);
    try {
      await apiRequest("/settings/printer-mode", {
        method: "PUT",
        body: JSON.stringify({ mode: next }),
      });
      if (mountedRef.current) {
        setMode(next);
        show(
          next === "single"
            ? "Modo: una sola impresora (cocina y barra al mismo equipo)"
            : "Modo: dos impresoras separadas (cocina y barra)",
          { type: "success" },
        );
      }
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al cambiar modo", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingMode(false);
    }
  };

  const handleSaveTargets = async () => {
    setSavingTargets(true);
    try {
      await apiRequest("/categories/printer-targets", {
        method: "PATCH",
        body: JSON.stringify({
          targets: categories.map(c => ({ id: c.id, printer_target: c.printer_target })),
        }),
      });
      if (mountedRef.current) show("Destinos guardados", { type: "success" });
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al guardar destinos", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingTargets(false);
    }
  };

  const ConnectionForm = ({
    cfg, onSet,
  }: {
    cfg: { ip: string; port: string; cups_url: string };
    onSet: (key: "ip" | "port" | "cups_url", val: string) => void;
  }) => (
    <div className="pc-section">
      <div className="pc-section-title">Conexión</div>
      <Input
        label="URL de impresora CUPS (opcional)"
        value={cfg.cups_url}
        onChange={e => onSet("cups_url", e.target.value)}
        placeholder="http://192.168.0.16:631/printers/80Series2"
        inputMode="url"
        autoComplete="off"
      />
      {cfg.cups_url.trim() ? (
        <p className="pc-cups-hint">CUPS activo — los campos IP y Puerto se ignoran.</p>
      ) : (
        <>
          <Input
            label="IP de la impresora"
            value={cfg.ip}
            onChange={e => onSet("ip", e.target.value)}
            placeholder="192.168.1.100"
            inputMode="url"
            autoComplete="off"
          />
          <Input
            label="Puerto"
            value={cfg.port}
            onChange={e => onSet("port", e.target.value)}
            inputMode="numeric"
          />
        </>
      )}
    </div>
  );

  const PaperToggle = ({
    value, onChange,
  }: {
    value: "58" | "80";
    onChange: (v: "58" | "80") => void;
  }) => (
    <div className="pc-section">
      <div className="pc-section-title">Ancho de papel</div>
      <div className="pc-paper-toggle">
        {(["58", "80"] as const).map(w => (
          <button
            key={w}
            className={`pc-paper-btn${value === w ? " pc-paper-btn--active" : ""}`}
            onClick={() => onChange(w)}
          >
            {w} mm
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="av-header">
        <h2 className="av-title">Impresoras</h2>
      </div>

      <div className="pc-content">
        {loading ? (
          <div className="al-stub"><span>Cargando...</span></div>
        ) : (
          <>
            {/* ── Cocina + Preview ───────────────────────── */}
            <div className="pc-section-title" style={{ marginBottom: 12 }}>Impresora Cocina (Recibos)</div>
            <div className="pc-layout">
              <div>
                <div className="pc-form-card">
                  <ConnectionForm
                    cfg={config}
                    onSet={(k, v) => set(k as keyof PrinterConfig, v)}
                  />

                  <PaperToggle value={config.width_mm as "58" | "80"} onChange={v => set("width_mm", v)} />

                  <div className="pc-section">
                    <div className="pc-section-title">Márgenes (mm)</div>
                    <div className="pc-margins-cross">
                      {(["top", "left", "right", "bottom"] as const).map(side => {
                        const key = `margin_${side}_mm` as keyof PrinterConfig;
                        const labels: Record<string, string> = { top: "Sup", bottom: "Inf", left: "Izq", right: "Der" };
                        return (
                          <div key={side} className={`pc-margin-field pc-margin-${side}`}>
                            <label className="pc-margin-label">{labels[side]}</label>
                            <input
                              type="number"
                              className="pc-margin-input"
                              min={0} max={20} step={1}
                              value={config[key] as number}
                              onChange={e => set(key, Math.min(20, Math.max(0, Number(e.target.value))))}
                            />
                            <span className="pc-margin-unit">mm</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pc-section">
                    <div className="pc-section-title">Logo de la empresa</div>
                    <div className="pc-logo-area">
                      <div className="pc-logo-thumb">
                        {config.logo_data_url ? (
                          <img src={config.logo_data_url} alt="Logo" />
                        ) : (
                          <span className="pc-logo-placeholder">🖼</span>
                        )}
                      </div>
                      <div className="pc-logo-actions">
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={handleLogoFile}
                        />
                        <button className="pc-logo-btn" onClick={() => fileRef.current?.click()}>
                          {config.logo_data_url ? "Cambiar logo" : "Subir logo"}
                        </button>
                        {config.logo_data_url && (
                          <button
                            className="pc-logo-btn pc-logo-btn--danger"
                            onClick={() => set("logo_data_url", "")}
                          >
                            Quitar logo
                          </button>
                        )}
                        <span className="pc-logo-hint">PNG o JPG · máx 110 KB</span>
                      </div>
                    </div>
                  </div>

                  <div className="pc-section">
                    <div className="pc-section-title">Texto de encabezado</div>
                    <textarea
                      className="pc-textarea"
                      rows={3}
                      maxLength={200}
                      placeholder={"Nombre del negocio\nTel: 1234-5678"}
                      value={config.header_text}
                      onChange={e => set("header_text", e.target.value.split("\n").slice(0, 4).join("\n"))}
                    />
                    <span className="pc-logo-hint">Máximo 4 líneas · aparece después del logo</span>
                  </div>

                  <div className="pc-section">
                    <div className="pc-section-title">Texto de pie</div>
                    <textarea
                      className="pc-textarea"
                      rows={3}
                      maxLength={200}
                      placeholder={"Gracias por su preferencia\nVuelva pronto"}
                      value={config.footer_text}
                      onChange={e => set("footer_text", e.target.value.split("\n").slice(0, 4).join("\n"))}
                    />
                    <span className="pc-logo-hint">Máximo 4 líneas · aparece al final del ticket</span>
                  </div>

                  <Button variant="primary" size="xl" fullWidth loading={saving} onClick={() => void handleSave()}>
                    Guardar impresora cocina
                  </Button>
                  <Button variant="secondary" size="xl" fullWidth loading={testing} onClick={() => void handleTestPrint()}>
                    Probar impresora cocina
                  </Button>
                </div>
              </div>

              <TicketPreview config={config} />
            </div>

            {/* ── Modo de impresoras ─────────────────────── */}
            <div className="pc-section-title" style={{ marginTop: 32, marginBottom: 12 }}>Modo de impresoras</div>
            <div className="pc-form-card" style={{ maxWidth: 560, marginBottom: 16 }}>
              <div className="pc-mode-toggle">
                <button
                  type="button"
                  className={`pc-mode-btn${mode === "single" ? " pc-mode-btn--active" : ""}`}
                  onClick={() => void handleChangeMode("single")}
                  disabled={savingMode}
                >
                  <div className="pc-mode-btn-title">Una impresora</div>
                  <div className="pc-mode-btn-desc">Cocina y barra usan la misma impresora</div>
                </button>
                <button
                  type="button"
                  className={`pc-mode-btn${mode === "dual" ? " pc-mode-btn--active" : ""}`}
                  onClick={() => void handleChangeMode("dual")}
                  disabled={savingMode}
                >
                  <div className="pc-mode-btn-title">Dos impresoras</div>
                  <div className="pc-mode-btn-desc">Una para cocina y otra para barra</div>
                </button>
              </div>
            </div>

            {/* ── Barra (sólo en modo dual) ──────────────── */}
            {mode === "dual" ? (
              <>
                <div className="pc-section-title" style={{ marginBottom: 12 }}>Impresora Barra (Bebidas)</div>
                <div className="pc-form-card" style={{ maxWidth: 560, marginBottom: 32 }}>
                  <ConnectionForm
                    cfg={barConfig}
                    onSet={(k, v) => setBar(k as keyof BarPrinterConfig, v)}
                  />
                  <PaperToggle value={barConfig.width_mm} onChange={v => setBar("width_mm", v)} />
                  <Button variant="primary"   size="xl" fullWidth loading={savingBar}  onClick={() => void handleSaveBar()}>
                    Guardar impresora barra
                  </Button>
                  <Button variant="secondary" size="xl" fullWidth loading={testingBar} onClick={() => void handleTestBar()}>
                    Probar impresora barra
                  </Button>
                </div>
              </>
            ) : (
              <div className="pc-form-card pc-mode-info" style={{ maxWidth: 560, marginBottom: 32 }}>
                Las bebidas se imprimirán en la <strong>impresora de cocina</strong>.
                Cambia a <em>Dos impresoras</em> arriba si quieres una impresora dedicada para la barra.
              </div>
            )}

            {/* ── Destino por categoría ─────────────────── */}
            <div className="pc-section-title" style={{ marginBottom: 6 }}>Destino por categoría</div>
            <p style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 12, maxWidth: 640 }}>
              {mode === "dual"
                ? "Cada categoría se enruta a su impresora física al imprimir el ticket de orden."
                : "Aunque haya una sola impresora, este filtro se usa al imprimir solo comida o solo bebidas."}
            </p>
            <div className="pc-form-card" style={{ marginBottom: 32 }}>
              {categories.length === 0 ? (
                <p style={{ color: "var(--text-3)", fontSize: 13 }}>No hay categorías configuradas.</p>
              ) : (
                <>
                  <div className="pc-cat-list">
                    {categories.map(cat => (
                      <div key={cat.id} className="pc-cat-row">
                        <span className="pc-cat-name">{cat.name}</span>
                        <div className="pc-cat-toggle">
                          <button
                            className={`pc-cat-btn${cat.printer_target === "kitchen" ? " pc-cat-btn--active" : ""}`}
                            onClick={() => cat.printer_target !== "kitchen" && toggleCatTarget(cat.id)}
                          >
                            Cocina
                          </button>
                          <button
                            className={`pc-cat-btn pc-cat-btn--bar${cat.printer_target === "bar" ? " pc-cat-btn--active-bar" : ""}`}
                            onClick={() => cat.printer_target !== "bar" && toggleCatTarget(cat.id)}
                          >
                            Barra
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button variant="primary" size="xl" fullWidth loading={savingTargets} onClick={() => void handleSaveTargets()}>
                    Guardar destinos
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
