import { useState, useMemo, useCallback, useRef } from "react";
import { Button, useToast } from "@pos/ui-kit";
import { apiRequest } from "@pos/api-client";
import { fmt } from "@pos/pos-core";
import type { CartItem } from "@pos/types";
import "./split-bill.css";

/* ── Helpers ────────────────────────────────────────────────── */

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const uuid  = () => crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/* ── Types ──────────────────────────────────────────────────── */

interface SplitItem {
  productId: number;
  name:      string;
  price:     number;
  quantity:  number;
  notes?:    string;
}

interface Props {
  open:          boolean;
  onClose:       () => void;
  cart:          CartItem[];
  cartTotal:     number;
  tipPercentage?: number;
  onAllPaid:     (lastSaleId: number | null) => void;
}

/* ── Icons ──────────────────────────────────────────────────── */

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function PrinterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ITEM ROWS
═══════════════════════════════════════════════════════════════ */

function PendingRow({ item, onMove }: { item: SplitItem; onMove: () => void }) {
  return (
    <div className="sb-row">
      <span className="sb-row-qty">{item.quantity}</span>
      <div className="sb-row-info">
        <span className="sb-row-name">{item.name}</span>
        <span className="sb-row-price">{fmt(item.price)} × {item.quantity} = {fmt(money(item.price * item.quantity))}</span>
        {item.notes && <span className="sb-row-notes">📝 {item.notes}</span>}
      </div>
      <button className="sb-row-action sb-row-action--add" onClick={onMove} aria-label={`Agregar ${item.name}`}>
        <ChevronRightIcon />
      </button>
    </div>
  );
}

function SubRow({ item, onReturn }: { item: SplitItem; onReturn: () => void }) {
  return (
    <div className="sb-row sb-row--sub">
      <span className="sb-row-qty sb-row-qty--sub">{item.quantity}</span>
      <div className="sb-row-info">
        <span className="sb-row-name">{item.name}</span>
        <span className="sb-row-price">{fmt(item.price)} × {item.quantity} = {fmt(money(item.price * item.quantity))}</span>
        {item.notes && <span className="sb-row-notes">📝 {item.notes}</span>}
      </div>
      <button className="sb-row-action sb-row-action--remove" onClick={onReturn} aria-label={`Devolver ${item.name}`}>
        <ChevronLeftIcon />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */

export default function SplitBillSheet({
  open, onClose, cart, cartTotal, tipPercentage = 0, onAllPaid,
}: Props) {
  const { show } = useToast();

  const [paidMap, setPaidMap]       = useState<Record<number, number>>({});
  const [rightItems, setRightItems] = useState<SplitItem[]>([]);
  const [subCount, setSubCount]     = useState(0);
  const [loading, setLoading]       = useState(false);
  const [includeTip, setIncludeTip] = useState(true);
  const requestIdRef = useRef<string | null>(null);

  /* ── memos ─────────────────────────────────────────────────── */

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

  /* ── reset ─────────────────────────────────────────────────── */

  const resetState = useCallback(() => {
    setPaidMap({});
    setRightItems([]);
    setSubCount(0);
    setLoading(false);
    setIncludeTip(true);
    requestIdRef.current = null;
  }, []);

  /* ── mover ítems ───────────────────────────────────────────── */

  const moveToRight = (item: SplitItem) => {
    setRightItems(prev => {
      const ex = prev.find(i => i.productId === item.productId);
      if (ex) return prev.map(i => i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i);
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
        const ex = next.find(i => i.productId === item.productId);
        if (ex) ex.quantity += item.quantity;
        else next.push({ ...item });
      }
      return next;
    });
  };

  /* ── cobrar sub-cuenta ─────────────────────────────────────── */

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
        setTimeout(() => { onAllPaid(result.id ?? null); resetState(); }, 350);
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

  return (
    <div className="sb-sheet">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="sb-header">
        <div className="sb-header-top">
          <div>
            <div className="sb-header-title">Dividir cuenta</div>
            <div className="sb-header-sub">
              {fmt(cartTotal)}
              {subCount > 0 && ` · ${subCount} cobrada${subCount !== 1 ? "s" : ""}`}
            </div>
          </div>
          <div className="sb-header-actions">
            {/* Toggle propina */}
            <label className="sb-tip-toggle">
              <span className="sb-tip-label">
                Propina{tipPercentage > 0 ? ` (${tipPercentage}%)` : ""}
              </span>
              <div
                className={`sb-switch${includeTip ? " sb-switch--on" : ""}`}
                onClick={() => setIncludeTip(v => !v)}
                role="switch"
                aria-checked={includeTip}
              >
                <div className="sb-switch-thumb" />
              </div>
            </label>
            <button
              className="sb-close-btn"
              onClick={() => { resetState(); onClose(); }}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* ── Body: lista única desplazable ───────────────── */}
      <div className="sb-body">

        {/* ─ Sección: pendientes ─────────────────────── */}
        <div className="sb-section-header">
          <span className="sb-section-label">Artículos pendientes</span>
          <span className="sb-section-total">{fmt(pendingTotal)}</span>
        </div>

        {pendingItems.length === 0 ? (
          <div className="sb-empty">
            {allDone ? "Todos los artículos han sido cobrados" : "Todos están en la sub-cuenta activa"}
          </div>
        ) : (
          <>
            {pendingItems.map(item => (
              <PendingRow key={item.productId} item={item} onMove={() => moveToRight(item)} />
            ))}
            <button className="sb-move-all-btn" onClick={moveAllToRight}>
              Mover todo a sub-cuenta →
            </button>
          </>
        )}

        {/* ─ Sección: sub-cuenta activa ─────────────── */}
        <div className="sb-section-header sb-section-header--sub">
          <span className="sb-section-label">{subLabel}</span>
          <span className="sb-section-total">{fmt(rightTotal)}</span>
        </div>

        {rightItems.length === 0 ? (
          <div className="sb-empty">
            Toca los artículos de arriba para agregarlos
          </div>
        ) : (
          rightItems.map(item => (
            <SubRow key={item.productId} item={item} onReturn={() => moveToLeft(item)} />
          ))
        )}

        {/* spacer para que el footer fijo no tape el último ítem */}
        <div className="sb-body-spacer" />
      </div>

      {/* ── Footer sticky ───────────────────────────────── */}
      <div className="sb-footer">
        {/* Desglose */}
        {rightItems.length > 0 && (
          <div className="sb-breakdown">
            <div className="sb-breakdown-row">
              <span>Subtotal</span>
              <span className="tabular">{fmt(rightTotal)}</span>
            </div>
            {includeTip && tipPercentage > 0 && (
              <div className="sb-breakdown-row sb-breakdown-row--tip">
                <span>Propina ({tipPercentage}%)</span>
                <span className="tabular">+ {fmt(rightTipAmt)}</span>
              </div>
            )}
            <div className="sb-breakdown-row sb-breakdown-row--total">
              <span>Total</span>
              <span className="tabular">{fmt(rightGrandTotal)}</span>
            </div>
          </div>
        )}

        <Button
          variant="primary"
          size="xl"
          fullWidth
          disabled={rightItems.length === 0 || loading}
          loading={loading}
          onClick={() => void paySubAccount()}
        >
          <span className="sb-cobrar-label">
            <PrinterIcon />
            {rightItems.length === 0
              ? "Cobrar sub-cuenta"
              : `Cobrar ${subLabel} — ${fmt(rightGrandTotal)}`}
          </span>
        </Button>

        {/* Resumen de estado */}
        {(subCount > 0 || pendingItems.length > 0) && (
          <div className="sb-status">
            {subCount > 0 && (
              <span className="sb-status--ok">✓ {subCount} cobrada{subCount !== 1 ? "s" : ""}</span>
            )}
            {pendingItems.length > 0 && (
              <span>Pendiente: {fmt(pendingTotal)}</span>
            )}
            {allDone && (
              <span className="sb-status--ok">✓ Cuenta liquidada</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
