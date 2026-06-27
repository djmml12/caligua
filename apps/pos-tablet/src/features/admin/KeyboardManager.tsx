import { useEffect, useRef, useState } from "react";
import { Button, useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";

interface Props {
  onToggle?: (enabled: boolean) => void;
}

export default function KeyboardManager({ onToggle }: Props) {
  const { show }   = useToast();
  const mountedRef = useRef(true);

  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    void apiRequest("/settings/touch-keyboard").then((r: unknown) => {
      const res = r as Record<string, unknown>;
      if (res?.success && res.data && typeof res.data === "object") {
        const data = res.data as Record<string, unknown>;
        if (mountedRef.current) setEnabled(Boolean(data.enabled));
      }
    }).catch(() => {}).finally(() => {
      if (mountedRef.current) setLoading(false);
    });
    return () => { mountedRef.current = false; };
  }, []);

  const handleToggle = async (newValue: boolean) => {
    setSaving(true);
    try {
      await apiRequest("/settings/touch-keyboard", {
        method: "PUT",
        body: JSON.stringify({ enabled: newValue }),
      });
      if (mountedRef.current) {
        setEnabled(newValue);
        onToggle?.(newValue);
        show(
          newValue ? "Teclado virtual activado" : "Teclado virtual desactivado",
          { type: "success" },
        );
      }
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al guardar", { type: "error" });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="av-header">
        <h2 className="av-title">Teclado virtual</h2>
      </div>

      <div className="tips-content">
        {loading ? (
          <div className="al-stub"><span>Cargando...</span></div>
        ) : (
          <div className="tips-card">
            <div className="tips-title">Teclado táctil en pantalla</div>
            <p className="tips-desc">
              Cuando está activado, el cajero puede abrir un teclado virtual desde el
              menú lateral. Útil en tabletas sin teclado físico. Actualmente:{" "}
              <strong>{enabled ? "activado" : "desactivado"}</strong>.
            </p>

            <div className="kbd-toggle-row">
              <button
                className={`kbd-toggle${enabled ? " kbd-toggle--on" : ""}`}
                onClick={() => !saving && void handleToggle(!enabled)}
                aria-label={enabled ? "Desactivar teclado virtual" : "Activar teclado virtual"}
                disabled={saving}
              >
                <span className="kbd-toggle-knob" />
              </button>
              <span className="kbd-toggle-label">
                {enabled ? "Activado" : "Desactivado"}
              </span>
            </div>

            <Button
              variant={enabled ? "danger" : "primary"}
              size="xl"
              fullWidth
              loading={saving}
              onClick={() => void handleToggle(!enabled)}
            >
              {enabled ? "Desactivar teclado virtual" : "Activar teclado virtual"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
