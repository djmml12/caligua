import { useEffect, useState } from "react";
import type { CartItem, SavedOrder } from "@pos/types";
import type { TicketSlot, KitchenTarget } from "@pos/pos-core";
import { fmt, toNum } from "@pos/pos-core";
import { BottomSheet, Button, Spinner } from "@pos/ui-kit";
import "./ticket-tab.css";

interface TicketTabProps {
  cart:            CartItem[];
  cartTotal:       number;
  currentOrderId:  number | null;
  orderRef:        string;
  setOrderRef:     (v: string) => void;
  increaseQty:     (productId: number) => void;
  decreaseQty:     (productId: number) => void;
  removeItem:      (productId: number) => void;
  tipPercentage:   number;
  payLoading:      boolean;
  payNoTipLoading: boolean;
  saveLoading:     boolean;
  orders:          SavedOrder[];
  ordersLoading:   boolean;
  onPay:           (noTip: boolean) => Promise<void>;
  onSave:          () => Promise<void>;
  onLoadOrder:     (order: SavedOrder) => Promise<void>;
  onRefreshOrders: () => Promise<void>;
  /* Impresión de cocina/barra */
  printerMode:     "single" | "dual";
  printLoading:    boolean;
  onPrintKitchen:  (targets: KitchenTarget[]) => void;
  /* Multi-ticket */
  slots:           TicketSlot[];
  activeIndex:     number;
  onCreateTicket:  () => void;
  onSwitchTicket:  (index: number) => void;
  onCloseTicket:   (index: number) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-GT", {
    day:    "numeric",
    month:  "short",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

function slotLabel(slot: TicketSlot, index: number): string {
  if (slot.orderRef.trim()) return slot.orderRef.trim();
  return `Ticket ${index + 1}`;
}

function slotItemCount(slot: TicketSlot): number {
  return slot.cart.reduce((s, i) => s + i.quantity, 0);
}

/* ── Tab bar ─────────────────────────────────────────────── */
function TicketTabBar({
  slots,
  activeIndex,
  onSwitch,
  onCreate,
  onClose,
}: {
  slots: TicketSlot[];
  activeIndex: number;
  onSwitch: (i: number) => void;
  onCreate: () => void;
  onClose: (i: number) => void;
}) {
  return (
    <div className="tt-tabbar" role="tablist">
      {slots.map((slot, i) => {
        const count = slotItemCount(slot);
        const isActive = i === activeIndex;
        return (
          <button
            key={slot.id}
            role="tab"
            aria-selected={isActive}
            className={`tt-tab${isActive ? " tt-tab--active" : ""}`}
            onClick={() => onSwitch(i)}
          >
            <span className="tt-tab-label">{slotLabel(slot, i)}</span>
            {count > 0 && (
              <span className="tt-tab-count">{count > 99 ? "99+" : count}</span>
            )}
            <span
              className="tt-tab-close"
              role="button"
              aria-label={`Cerrar ${slotLabel(slot, i)}`}
              onClick={(e) => { e.stopPropagation(); onClose(i); }}
            >
              ×
            </span>
          </button>
        );
      })}
      <button
        className="tt-tab-new"
        onClick={onCreate}
        aria-label="Nuevo ticket"
        title="Nuevo ticket"
      >
        +
      </button>
    </div>
  );
}

/* ── TicketTab ───────────────────────────────────────────── */
export default function TicketTab({
  cart,
  cartTotal,
  currentOrderId,
  orderRef,
  setOrderRef,
  increaseQty,
  decreaseQty,
  removeItem,
  tipPercentage,
  payLoading,
  payNoTipLoading,
  saveLoading,
  orders,
  ordersLoading,
  onPay,
  onSave,
  onLoadOrder,
  onRefreshOrders,
  printerMode,
  printLoading,
  onPrintKitchen,
  slots,
  activeIndex,
  onCreateTicket,
  onSwitchTicket,
  onCloseTicket,
}: TicketTabProps) {
  const [paySheetOpen,    setPaySheetOpen]    = useState(false);
  const [ordersSheetOpen, setOrdersSheetOpen] = useState(false);

  /* Cierra sheets automáticamente según el estado del carrito. */
  useEffect(() => {
    if (cart.length === 0) setPaySheetOpen(false);
    if (cart.length > 0)  setOrdersSheetOpen(false);
  }, [cart.length]);

  /* Recarga la lista de órdenes al abrir el sheet. */
  useEffect(() => {
    if (ordersSheetOpen) void onRefreshOrders();
  }, [ordersSheetOpen, onRefreshOrders]);

  const tipAmount    = cartTotal * (tipPercentage / 100);
  const totalWithTip = cartTotal + tipAmount;
  const displayTotal = tipPercentage > 0 ? totalWithTip : cartTotal;

  async function handlePayButton(noTip: boolean) {
    await onPay(noTip);
    setPaySheetOpen(false);
  }

  async function handleSelectOrder(order: SavedOrder) {
    await onLoadOrder(order);
    setOrdersSheetOpen(false);
  }

  /* ── Ticket vacío ────────────────────────── */
  if (cart.length === 0) {
    return (
      <div className="tt-root">
        <TicketTabBar
          slots={slots}
          activeIndex={activeIndex}
          onSwitch={onSwitchTicket}
          onCreate={onCreateTicket}
          onClose={onCloseTicket}
        />

        <div className="tt-empty">
          <span className="tt-empty-icon">🧾</span>
          <p className="tt-empty-text">Ticket vacío</p>
          <p className="tt-empty-sub">Agregá productos desde el catálogo</p>

          {orders.length > 0 && (
            <button
              className="tt-orders-btn"
              onClick={() => setOrdersSheetOpen(true)}
            >
              Órdenes guardadas
              <span className="tt-orders-badge">{orders.length}</span>
            </button>
          )}
        </div>

        <BottomSheet
          open={ordersSheetOpen}
          onClose={() => setOrdersSheetOpen(false)}
          title="Órdenes guardadas"
          height="tall"
        >
          {ordersLoading ? (
            <div className="tt-orders-loading">
              <Spinner size="md" />
            </div>
          ) : orders.length === 0 ? (
            <p className="tt-orders-empty">No hay órdenes pendientes</p>
          ) : (
            <ul className="tt-orders-list">
              {orders.map((order) => (
                <li key={order.id}>
                  <button
                    className="tt-order-row"
                    onClick={() => handleSelectOrder(order)}
                  >
                    <div className="tt-order-ref">
                      {order.reference || "Sin referencia"}
                      {order.monthly_number != null && (
                        <span className="tt-order-num"> #{order.monthly_number}</span>
                      )}
                    </div>
                    <div className="tt-order-meta">
                      <span>{order.items_count ?? "?"} ítems</span>
                      <span>·</span>
                      <span className="tabular">{fmt(toNum(order.total))}</span>
                    </div>
                    <div className="tt-order-time">{formatTime(order.created_at)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </BottomSheet>
      </div>
    );
  }

  /* ── Ticket con ítems ────────────────────── */
  return (
    <div className="tt-root">
      <TicketTabBar
        slots={slots}
        activeIndex={activeIndex}
        onSwitch={onSwitchTicket}
        onCreate={onCreateTicket}
        onClose={onCloseTicket}
      />

      <div className="tt-header">
        <h2 className="tt-title">
          {currentOrderId != null ? "Orden guardada" : "Ticket"}
        </h2>
        <input
          className="tt-ref-input"
          placeholder="Mesa / referencia…"
          value={orderRef}
          onChange={(e) => setOrderRef(e.target.value)}
          maxLength={40}
        />
      </div>

      <ul className="tt-list" aria-label="Ítems del ticket">
        {cart.map((item) => (
          <li key={item.productId} className="tt-item">
            <div className="tt-item-info">
              <p className="tt-item-name">{item.name}</p>
              <p className="tt-item-line">{fmt(item.price)} × {item.quantity}</p>
            </div>

            <div className="tt-qty">
              <button
                className="tt-qty-btn"
                onClick={() => decreaseQty(item.productId)}
                aria-label={`Reducir ${item.name}`}
              >
                −
              </button>
              <span className="tt-qty-val">{item.quantity}</span>
              <button
                className="tt-qty-btn"
                onClick={() => increaseQty(item.productId)}
                aria-label={`Aumentar ${item.name}`}
              >
                +
              </button>
            </div>

            <button
              className="tt-remove"
              onClick={() => removeItem(item.productId)}
              aria-label={`Eliminar ${item.name}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="tt-footer">
        <div className="tt-totals">
          <div className="tt-total-row">
            <span>Subtotal</span>
            <span className="tabular">{fmt(cartTotal)}</span>
          </div>
          {tipPercentage > 0 && (
            <div className="tt-total-row">
              <span>Propina ({tipPercentage}%)</span>
              <span className="tabular">{fmt(tipAmount)}</span>
            </div>
          )}
          <div className="tt-total-row tt-total-row--main">
            <span>Total</span>
            <span className="tabular">{fmt(displayTotal)}</span>
          </div>
        </div>

        <div className="tt-kitchen-row">
            {printerMode === "dual" ? (
              <>
                <button
                  className="tt-kitchen-btn tt-kitchen-btn--kitchen"
                  onClick={() => onPrintKitchen(["kitchen"])}
                  disabled={printLoading}
                  title="Enviar a cocina"
                >
                  {printLoading ? <Spinner size="sm" /> : "🍳"} Cocina
                </button>
                <button
                  className="tt-kitchen-btn tt-kitchen-btn--bar"
                  onClick={() => onPrintKitchen(["bar"])}
                  disabled={printLoading}
                  title="Enviar a barra"
                >
                  {printLoading ? <Spinner size="sm" /> : "🥤"} Barra
                </button>
                <button
                  className="tt-kitchen-btn tt-kitchen-btn--both"
                  onClick={() => onPrintKitchen(["kitchen", "bar"])}
                  disabled={printLoading}
                  title="Enviar a cocina y barra"
                >
                  {printLoading ? <Spinner size="sm" /> : "📋"} Ambas
                </button>
              </>
            ) : (
              <button
                className="tt-kitchen-btn tt-kitchen-btn--kitchen tt-kitchen-btn--full"
                onClick={() => onPrintKitchen(["kitchen", "bar"])}
                disabled={printLoading}
                title="Enviar a cocina"
              >
                {printLoading ? <Spinner size="sm" /> : "🍳"} Enviar a cocina
              </button>
            )}
          </div>

        <div className="tt-footer-actions">
          <Button
            variant="ghost"
            size="md"
            loading={saveLoading}
            disabled={payLoading || payNoTipLoading}
            onClick={onSave}
            className="tt-save-btn"
          >
            {currentOrderId != null ? "Actualizar" : "Guardar"}
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={saveLoading}
            onClick={() => setPaySheetOpen(true)}
            className="tt-pay-btn"
          >
            Cobrar
          </Button>
        </div>
      </div>

      {/* ── Pay BottomSheet ─────────────────── */}
      <BottomSheet
        open={paySheetOpen}
        onClose={() => setPaySheetOpen(false)}
        title="Resumen de cobro"
      >
        <div className="tt-pay-amounts">
          <div className="tt-pay-row">
            <span>Subtotal</span>
            <span className="tabular">{fmt(cartTotal)}</span>
          </div>
          {tipPercentage > 0 && (
            <div className="tt-pay-row">
              <span>Propina ({tipPercentage}%)</span>
              <span className="tabular">{fmt(tipAmount)}</span>
            </div>
          )}
          <div className="tt-pay-row tt-pay-row--total">
            <span>Total a cobrar</span>
            <span className="tabular">{fmt(displayTotal)}</span>
          </div>
        </div>

        <div className="tt-pay-btns">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={payLoading}
            disabled={payNoTipLoading}
            onClick={() => handlePayButton(false)}
          >
            {tipPercentage > 0
              ? `Cobrar con propina — ${fmt(totalWithTip)}`
              : `Cobrar — ${fmt(cartTotal)}`}
          </Button>

          {tipPercentage > 0 && (
            <Button
              variant="secondary"
              size="md"
              fullWidth
              loading={payNoTipLoading}
              disabled={payLoading}
              onClick={() => handlePayButton(true)}
            >
              Sin propina — {fmt(cartTotal)}
            </Button>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
