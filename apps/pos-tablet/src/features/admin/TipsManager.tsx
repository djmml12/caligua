import { useEffect, useRef, useState } from "react";
import { Button, NumKeypad, useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";

export default function TipsManager() {
  const { show }   = useToast();
  const mountedRef = useRef(true);

  const [tip,      setTip]      = useState(10);
  const [value,    setValue]    = useState("10");
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    void apiRequest("/settings/tip").then((r: unknown) => {
      const res = r as Record<string, unknown>;
      if (res?.success) {
        const v = Number(res.value);
        if (mountedRef.current) { setTip(v); setValue(String(v)); }
      }
    }).catch(() => {}).finally(() => {
      if (mountedRef.current) setLoading(false);
    });
    return () => { mountedRef.current = false; };
  }, []);

  const handleSave = async () => {
    const v = parseInt(value, 10);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      show("Ingresa un valor entre 0 y 100", { type: "warning" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/settings/tip", { method: "PUT", body: JSON.stringify({ value: v }) });
      if (mountedRef.current) {
        setTip(v);
        show(`Propina actualizada a ${v}%`, { type: "success" });
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
        <h2 className="av-title">Propinas</h2>
      </div>

      <div className="tips-content">
        {loading ? (
          <div className="al-stub"><span>Cargando...</span></div>
        ) : (
          <div className="tips-card">
            <div className="tips-title">Porcentaje de propina sugerido</div>
            <p className="tips-desc">
              Este valor se mostrará como propina sugerida al momento del cobro.
              Actualmente configurado en <strong>{tip}%</strong>.
            </p>

            <NumKeypad
              value={value}
              onChange={setValue}
              showConfirm
              onConfirm={() => void handleSave()}
              displayLabel="Porcentaje (%)"
              maxLength={3}
            />

            <Button
              variant="primary"
              size="xl"
              fullWidth
              loading={saving}
              onClick={() => void handleSave()}
            >
              Guardar — {value || "0"}%
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
