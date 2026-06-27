import { useState, useMemo, useCallback, useRef } from "react";
import { Button, useToast } from "@pos/ui-kit";
import { apiRequest } from "@pos/api-client";
import { fmt } from "@pos/pos-core";
import type { CartItem } from "@pos/types";

/* ── Helpers ────────────────────────────────────────────────── */

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const uuid = () => crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/* ── Types ──────────────────────────────────────────────────── */

interface SplitItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  cart: CartItem[];
  cartTotal: number;
  tipPercentage?: number;
  onAllPaid: (lastSaleId: number | null) => void;
}

/* ── Icons ──────────────────────────────────────────────────── */

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function EmptyTicketIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}

/* ── Item row ─────────────────────────────────────────────── */

interface ItemRowProps {
  item: SplitItem;
  arrowDir: "right" | "left";
  onClick: () => void;
  disabled?: boolean;
}

function ItemRow({ item, arrowDir, onClick, disabled }: ItemRowProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: hovered && !disabled ? "var(--surface-2, #fcf2e3)" : "transparent",
        border: "none",
        borderBottom: "1px solid var(--border, #ece3d5)",
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
        transition: "background var(--dur-fast, 120ms) var(--ease)",
      }}
    >
      <span style={{
        flexShrink: 0,
        minWidth: 26,
        height: 26,
        borderRadius: "var(--radius-pill, 999px)",
        background: "var(--surface-2, #fcf2e3)",
        border: "1.5px solid var(--border, #ece3d5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 800,
        color: "var(--text-1, #1c1917)",
      }}>
        {item.quantity}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1, #1c1917)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3, #a8a29e)", marginTop: 1 }}>
          {fmt(item.price)} × {item.quantity} = {fmt(money(item.price * item.quantity))}
        </div>
        {item.notes && (
          <div style={{ fontSize: 11, color: "var(--primary, #b91c1c)", background: "var(--primary-bg, #fef2f2)", padding: "1px 6px", borderRadius: 3, marginTop: 3, display: "inline-block" }}>
            📝 {item.notes}
          </div>
        )}
      </div>
      {!disabled && (
        <span style={{ flexShrink: 0, color: "var(--text-3, #a8a29e)" }}>
          {arrowDir === "right" ? <ArrowRightIcon /> : <ArrowLeftIcon />}
        </span>
      )}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */

export default function SplitBillSheet({ open, onClose, cart, cartTotal, tipPercentage = 0, onAllPaid }: Props) {
  const { show } = useToast();

  const [paidMap, setPaidMap]       = useState<Record<number, number>>({});
  const [rightItems, setRightItems] = useState<SplitItem[]>([]);
  const [subCount, setSubCount]     = useState(0);
  const [loading, setLoading]       = useState(false);
  const [includeTip, setIncludeTip] = useState(true);
  const requestIdRef = useRef<string | null>(null);

  const rightMap = useMemo(() => {
    const m: Record<number, number> = {};
    for (const i of rightItems) m[i.productId] = (m[i.productId] ?? 0) + i.quantity;
    return m;
  }, [rightItems]);

  const pendingItems = useMemo<SplitItem[]>(() =>
    cart.flatMap(item => {
      const paid      = paidMap[item.productId] ?? 0;
      const inRight   = rightMap[item.productId] ?? 0;
      const remaining = item.quantity - paid - inRight;
      return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
    }),
    [cart, paidMap, rightMap],
  );

  const totalPendingQty = useMemo(
    () => pendingItems.reduce((s, i) => s + i.quantity, 0) + rightItems.reduce((s, i) => s + i.quantity, 0),
    [pendingItems, rightItems],
  );

  const resetState = useCallback(() => {
    setPaidMap({});
    setRightItems([]);
    setSubCount(0);
    setLoading(false);
    setIncludeTip(true);
    requestIdRef.current = null;
  }, []);

  const moveToRight = (item: SplitItem) => {
    setRightItems(prev => {
      const existing = prev.find(i => i.productId === item.productId);
      if (existing) return prev.map(i => i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const moveToLeft = (item: SplitItem) => {
    setRightItems(prev =>
      prev.map(i => i.productId === item.productId ? { ...i, quantity: i.quantity - 1 } : i)
          .filter(i => i.quantity > 0),
    );
  };

  const moveAllToRight = () => {
    setRightItems(prev => {
      const next = [...prev];
      for (const item of pendingItems) {
        const existing = next.find(i => i.productId === item.productId);
        if (existing) existing.quantity += item.quantity;
        else next.push({ ...item });
      }
      return next;
    });
  };

  const paySubAccount = async () => {
    if (rightItems.length === 0) return;
    if (!requestIdRef.current) requestIdRef.current = uuid();
    setLoading(true);
    const label = `SUB CUENTA ${subCount + 1}`;
    try {
      const result = await apiRequest("/sales", {
        method: "POST",
        body: JSON.stringify({
          items: rightItems.map(i => ({ product_id: i.productId, quantity: i.quantity, notes: i.notes || null })),
          ...(includeTip ? {} : { tip_amount: 0, tip_percentage: 0 }),
          reference: label,
          client_request_id: requestIdRef.current,
        }),
      }) as { id?: number };

      const subTotal = money(rightItems.reduce((s, i) => s + money(i.price * i.quantity), 0));
      show(`${label} cobrada — ${fmt(subTotal)}`, { type: "success" });

      if (result.id) {
        try {
          await apiRequest("/print/receipt", {
            method: "POST",
            body: JSON.stringify({ sale_id: result.id }),
            timeoutMs: 10_000,
          });
          show(`Recibo de ${label} enviado`, { type: "success" });
        } catch {
          show("Impresora no disponible", { type: "error" });
        }
      }

      const snapshot = [...rightItems];
      setPaidMap(prev => {
        const next = { ...prev };
        for (const i of snapshot) next[i.productId] = (next[i.productId] ?? 0) + i.quantity;
        return next;
      });
      setRightItems([]);
      setSubCount(c => c + 1);
      requestIdRef.current = null;

      const stillPending = cart.some(item => {
        const nowPaid = (paidMap[item.productId] ?? 0) + (snapshot.find(s => s.productId === item.productId)?.quantity ?? 0);
        return nowPaid < item.quantity;
      });
      if (!stillPending) {
        setTimeout(() => { onAllPaid(result.id ?? null); resetState(); }, 400);
      }
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al cobrar", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const rightTotal      = money(rightItems.reduce((s, i) => s + money(i.price * i.quantity), 0));
  const rightTipAmt     = includeTip && tipPercentage > 0 ? money(rightTotal * tipPercentage / 100) : 0;
  const rightGrandTotal = money(rightTotal + rightTipAmt);
  const pendingTotal    = money(pendingItems.reduce((s, i) => s + money(i.price * i.quantity), 0));
  const subLabel        = `Sub cuenta ${subCount + 1}`;
  const allDone         = totalPendingQty === 0;

  /* ── color aliases ─────────────────────────────────────────── */
  const C = {
    overlay:      "rgba(28, 25, 23, 0.60)",
    panel:        "var(--surface, #ffffff)",
    header:       "var(--surface-2, #fcf2e3)",
    border:       "var(--border, #ece3d5)",
    borderStrong: "#d6ccbf",
    canvas:       "var(--canvas, #faf6ef)",
    primary:      "var(--primary, #b91c1c)",
    primaryBg:    "var(--primary-bg, #fef2f2)",
    text1:        "var(--text-1, #1c1917)",
    text2:        "var(--text-2, #57534e)",
    text3:        "var(--text-3, #a8a29e)",
    success:      "var(--success, #15803d)",
    shadow:       "0 24px 48px rgba(28, 25, 23, 0.18)",
  } as const;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) { resetState(); onClose(); } }}
      style={{
        position: "fixed",
        inset: 0,
        background: C.overlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1200,
        padding: 20,
      }}
    >
      <div style={{
        background: C.panel,
        border: `1.5px solid ${C.borderStrong}`,
        borderRadius: "var(--radius-xl, 20px)",
        width: "min(900px, 96vw)",
        height: "min(700px, 90vh)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: C.shadow,
      }}>

        {/* ── Header ──────────────────────────────────────── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: `1.5px solid ${C.borderStrong}`,
          background: C.header,
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.text1 }}>Dividir cuenta</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>
              Total: {fmt(cartTotal)}
              {subCount > 0 && ` · ${subCount} sub-cuenta${subCount !== 1 ? "s" : ""} cobrada${subCount !== 1 ? "s" : ""}`}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Toggle propina */}
            <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text2 }}>
                Propina{tipPercentage > 0 ? ` (${tipPercentage}%)` : ""}
              </span>
              <div
                onClick={() => setIncludeTip(v => !v)}
                style={{
                  width: 48, height: 26, borderRadius: "var(--radius-pill, 999px)",
                  background: includeTip ? C.primary : C.border,
                  position: "relative", cursor: "pointer",
                  transition: "background var(--dur-base, 180ms) var(--ease)",
                  flexShrink: 0,
                }}
              >
                <div style={{
                  position: "absolute", top: 3,
                  left: includeTip ? 24 : 3,
                  width: 20, height: 20,
                  borderRadius: "var(--radius-pill, 999px)",
                  background: "#fff",
                  transition: "left var(--dur-base, 180ms) var(--ease)",
                  boxShadow: "0 1px 3px rgba(28,25,23,0.18)",
                }} />
              </div>
            </label>
            <button
              onClick={() => { resetState(); onClose(); }}
              style={{
                width: 32, height: 32, borderRadius: "var(--radius-pill, 999px)",
                border: `1px solid ${C.border}`,
                background: C.canvas,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, color: C.text2,
                transition: "background var(--dur-fast, 120ms) var(--ease)",
              }}
            >✕</button>
          </div>
        </div>

        {/* ── Body: dos columnas ───────────────────────────── */}
        <div style={{ flex: 1, display: "flex", gap: 12, padding: 14, minHeight: 0, overflow: "hidden" }}>

          {/* ── IZQUIERDA: artículos pendientes ────────────── */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            background: C.canvas,
            border: `1.5px solid ${C.border}`,
            borderRadius: "var(--radius-lg, 16px)",
            overflow: "hidden", minWidth: 0,
          }}>
            {/* header izq */}
            <div style={{
              padding: "11px 14px",
              borderBottom: `1px solid ${C.border}`,
              background: C.header,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.text1 }}>Artículos pendientes</div>
                {pendingItems.length > 0 && (
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 1 }}>
                    Toca para agregar a la sub-cuenta
                  </div>
                )}
              </div>
              <span style={{ fontWeight: 700, fontSize: 13, color: C.primary }}>
                {fmt(pendingTotal)}
              </span>
            </div>

            {/* lista pendientes */}
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
              {pendingItems.length === 0 ? (
                <div style={{
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  height: "100%", color: C.text3,
                  fontSize: 13, gap: 10, padding: 24, textAlign: "center",
                }}>
                  <EmptyTicketIcon />
                  {allDone
                    ? "Todos los artículos han sido cobrados"
                    : "Todos los artículos están en la sub-cuenta activa"}
                </div>
              ) : (
                pendingItems.map(item => (
                  <ItemRow key={item.productId} item={item} arrowDir="right" onClick={() => moveToRight(item)} />
                ))
              )}
            </div>

            {/* footer izq */}
            {pendingItems.length > 0 && (
              <div style={{
                padding: "10px 12px",
                borderTop: `1px solid ${C.border}`,
                background: C.header,
                flexShrink: 0,
              }}>
                <button
                  onClick={moveAllToRight}
                  style={{
                    width: "100%", padding: "9px 0",
                    borderRadius: "var(--radius-sm, 8px)",
                    border: `1.5px solid ${C.border}`,
                    background: C.panel,
                    color: C.text1, fontWeight: 700, fontSize: 13,
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    transition: "background var(--dur-fast, 120ms) var(--ease)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2, #fcf2e3)")}
                  onMouseLeave={e => (e.currentTarget.style.background = C.panel)}
                >
                  Mover todo <ArrowRightIcon />
                </button>
              </div>
            )}
          </div>

          {/* divider */}
          <div style={{ width: 1, background: C.border, flexShrink: 0, alignSelf: "stretch", margin: "8px 0" }} />

          {/* ── DERECHA: sub-cuenta activa ─────────────────── */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            background: C.canvas,
            border: `1.5px solid ${C.border}`,
            borderRadius: "var(--radius-lg, 16px)",
            overflow: "hidden", minWidth: 0,
          }}>
            {/* header der */}
            <div style={{
              padding: "11px 14px",
              borderBottom: `1px solid ${C.border}`,
              background: C.header,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.text1 }}>{subLabel}</div>
                {rightItems.length > 0 && (
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 1 }}>
                    Toca para devolver al pendiente
                  </div>
                )}
              </div>
              <span style={{ fontWeight: 700, fontSize: 13, color: C.primary }}>
                {fmt(rightTotal)}
              </span>
            </div>

            {/* lista sub-cuenta */}
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
              {rightItems.length === 0 ? (
                <div style={{
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  height: "100%", color: C.text3,
                  fontSize: 13, gap: 10, padding: 24, textAlign: "center",
                }}>
                  <EmptyTicketIcon />
                  Toca artículos de la izquierda para agregarlos aquí
                </div>
              ) : (
                rightItems.map(item => (
                  <ItemRow key={item.productId} item={item} arrowDir="left" onClick={() => moveToLeft(item)} />
                ))
              )}
            </div>

            {/* footer der: desglose + botón cobrar */}
            <div style={{
              padding: "10px 12px",
              borderTop: `1px solid ${C.border}`,
              background: C.header,
              flexShrink: 0,
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              {rightItems.length > 0 && (
                <div style={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: "var(--radius-sm, 8px)",
                  padding: "8px 12px",
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.text2 }}>
                    <span>Subtotal</span>
                    <span>{fmt(rightTotal)}</span>
                  </div>
                  {includeTip && tipPercentage > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.primary }}>
                      <span>Propina ({tipPercentage}%)</span>
                      <span>+ {fmt(rightTipAmt)}</span>
                    </div>
                  )}
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    fontSize: 15, fontWeight: 800, color: C.text1,
                    borderTop: `1px solid ${C.border}`,
                    paddingTop: 5, marginTop: 2,
                  }}>
                    <span>Total</span>
                    <span>{fmt(rightGrandTotal)}</span>
                  </div>
                </div>
              )}
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={rightItems.length === 0 || loading}
                loading={loading}
                onClick={() => void paySubAccount()}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <PrinterIcon />
                  {rightItems.length === 0
                    ? "Cobrar sub-cuenta"
                    : `Cobrar ${subLabel} — ${fmt(rightGrandTotal)}`}
                </span>
              </Button>
            </div>
          </div>
        </div>

        {/* ── Footer: resumen ───────────────────────────────── */}
        <div style={{
          padding: "8px 20px 12px",
          borderTop: `1px solid ${C.border}`,
          background: C.header,
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 20, flexShrink: 0,
          fontSize: 12, color: C.text3, fontWeight: 600,
        }}>
          {subCount > 0 && (
            <span style={{ color: C.success }}>
              ✓ {subCount} cobrada{subCount !== 1 ? "s" : ""}
            </span>
          )}
          {pendingItems.length > 0 && (
            <span>Pendiente: {fmt(pendingTotal)}</span>
          )}
          {rightItems.length > 0 && (
            <span>En sub-cuenta: {fmt(rightTotal)}</span>
          )}
          {allDone && (
            <span style={{ color: C.success, fontWeight: 700 }}>
              ✓ Cuenta liquidada completamente
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
