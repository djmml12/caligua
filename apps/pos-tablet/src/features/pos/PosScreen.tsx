import {
  useCallback, useEffect, useRef, useState,
} from "react";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor,
  useSensor, useSensors, closestCenter, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, rectSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BottomSheet, Button, NumKeypad, Spinner,
} from "@pos/ui-kit";
import {
  useCatalog, useTicket, useOrders, useCheckout, usePrinting,
  fmt, toNum,
} from "@pos/pos-core";
import { apiRequest } from "@pos/api-client";
import type { Product, CartItem, SavedOrder } from "@pos/types";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import SplitBillSheet from "./SplitBillSheet";
import "./pos.css";

/* ── Inline SVG icons ─────────────────────────────────────── */

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ReorderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
      <circle cx="7" cy="17" r="1" /><circle cx="17" cy="17" r="1" />
      <path d="M9 11l1 4" /><line x1="12" y1="3" x2="12" y2="7" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 7 6 2 18 2 18 7" />
      <path d="M6 18H4a2 2 0 0 1-2-2V7h20v9a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="13" width="12" height="9" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function EmptyTicketIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="10" y2="9" />
    </svg>
  );
}

/* ── Sortable product card (DnD reorder mode) ─────────────── */

function SortableProductCard({
  product,
  isFlashing,
}: {
  product: Product;
  isFlashing: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: product.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      {...attributes}
      {...listeners}
      className={`ps-product-card ps-product-card--reorder${isFlashing ? " ps-product-card--added" : ""}`}
    >
      <span className="ps-product-name">{product.name}</span>
      <span className="ps-product-price">{fmt(toNum(product.price))}</span>
      {product.stock != null && (
        <span className="ps-product-stock">Stock: {product.stock}</span>
      )}
    </div>
  );
}

/* ── Regular product card ─────────────────────────────────── */

function ProductCard({
  product,
  onAdd,
  isFlashing,
}: {
  product: Product;
  onAdd: (p: Product) => void;
  isFlashing: boolean;
}) {
  return (
    <div
      className={`ps-product-card${isFlashing ? " ps-product-card--added" : ""}`}
      onClick={() => onAdd(product)}
    >
      <span className="ps-product-name">{product.name}</span>
      <span className="ps-product-price">{fmt(toNum(product.price))}</span>
      {product.stock != null && (
        <span className="ps-product-stock">Stock: {product.stock}</span>
      )}
      <div className="ps-product-add-badge" aria-hidden="true">+</div>
    </div>
  );
}

/* ── Ticket item row (sin SwipeRow) ──────────────────────── */

function TicketItemRow({
  item,
  isEditingNotes,
  onIncrease,
  onDecrease,
  onEditQty,
  onToggleNotes,
  onCloseNotes,
  onSetNotes,
  onRemove,
}: {
  item: CartItem;
  isEditingNotes: boolean;
  onIncrease: () => void;
  onDecrease: () => void;
  onEditQty: () => void;
  onToggleNotes: () => void;
  onCloseNotes: () => void;
  onSetNotes: (notes: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="ps-ticket-row">
      <div className="ps-ticket-row-top">
        <div className="ps-ticket-item-info">
          <div className="ps-ticket-item-name">{item.name}</div>
          <div className="ps-ticket-item-price">{fmt(item.price)} c/u</div>
        </div>
        <div className="ps-ticket-item-line-total">{fmt(item.price * item.quantity)}</div>
      </div>

      <div className="ps-ticket-row-actions">
        <div className="ps-ticket-qty-row">
          <button
            type="button"
            className="ps-ticket-qty-btn"
            onClick={onDecrease}
            aria-label="Quitar uno"
          >−</button>
          <button
            type="button"
            className="ps-ticket-qty"
            onClick={onEditQty}
            aria-label={`Cantidad: ${item.quantity}. Toca para editar`}
          >{item.quantity}</button>
          <button
            type="button"
            className="ps-ticket-qty-btn"
            onClick={onIncrease}
            aria-label="Agregar uno"
          >+</button>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            className="ps-ticket-qty-btn"
            title={item.notes ? `Nota: ${item.notes}` : "Agregar nota"}
            onClick={onToggleNotes}
            style={{
              background: item.notes ? "#fbbf24" : "inherit",
              color: item.notes ? "#78350f" : "inherit",
            }}
            aria-label="Nota del ítem"
          >📝</button>
          <button
            type="button"
            className="ps-ticket-delete-btn"
            onClick={onRemove}
            aria-label="Eliminar ítem"
          ><TrashIcon /></button>
        </div>
      </div>

      {isEditingNotes && (
        <div style={{ padding: "6px 0", marginTop: 6, borderTop: "1px solid #e5e7eb" }}>
          <input
            type="text"
            autoFocus
            placeholder="Ej: sin cebolla..."
            value={item.notes || ""}
            onChange={(e) => onSetNotes(e.target.value)}
            onBlur={onCloseNotes}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") onCloseNotes();
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid #fbbf24",
              borderRadius: 4,
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
        </div>
      )}
      {item.notes && !isEditingNotes && (
        <div style={{
          fontSize: 11,
          color: "#78350f",
          background: "#fef3c7",
          padding: "2px 8px",
          marginTop: 4,
          borderRadius: 3,
        }}>
          📝 {item.notes}
        </div>
      )}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────── */

interface Props {
  role: string;
  onGoToAdmin: () => void;
  onLogout: () => void;
}

type Screen = "pos" | "orders" | "completed" | "history";

interface PaidSale {
  id:             number;
  monthly_number: number | null;
  reference:      string | null;
  total:          number | string;
  tip_amount:     number | string;
  paid_at:        string | null;
  created_at:     string;
  user_name:      string;
}

export default function PosScreen({ role, onGoToAdmin, onLogout }: Props) {
  /* ── Hooks de @pos/pos-core ───────────────────────────── */
  const catalog  = useCatalog();
  const ticket   = useTicket();
  const ordersH  = useOrders();
  const checkout = useCheckout();
  const printing = usePrinting();

  /* ── Mounted ref para guardar setStates locales tras async ── */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* ── Screen routing (UI-only) ─────────────────────────── */
  const [screen,            setScreen]            = useState<Screen>("pos");
  const [completedTotal,    setCompletedTotal]    = useState(0);
  const [completedRef,      setCompletedRef]      = useState("");
  const [completedSaleId,   setCompletedSaleId]   = useState<number | null>(null);

  /* ── Notas inline en items (UI-only) ──────────────────── */
  const [editingItemNotesId, setEditingItemNotesId] = useState<number | null>(null);

  /* ── Modal cancelar orden (UI-only) ───────────────────── */
  const [orderToCancel, setOrderToCancel] = useState<SavedOrder | null>(null);

  /* ── DnD reorder (UI-only) ────────────────────────────── */
  const [reorderMode,  setReorderMode]  = useState(false);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  /* ── Qty editing BottomSheet (UI-only) ────────────────── */
  const [qtyItem,      setQtyItem]      = useState<CartItem | null>(null);
  const [qtyValue,     setQtyValue]     = useState("1");
  const [showQtySheet, setShowQtySheet] = useState(false);

  /* ── Pay BottomSheet (UI-only) ────────────────────────── */
  const [showPaySheet, setShowPaySheet] = useState(false);

  /* ── Save / ref BottomSheet (UI-only) ─────────────────── */
  const [showRefSheet, setShowRefSheet] = useState(false);
  const [pendingRef,   setPendingRef]   = useState("");

  /* ── Split bill sheet (UI-only) ───────────────────────── */
  const [showSplitSheet, setShowSplitSheet] = useState(false);

  /* ── History (ventas cobradas) ────────────────────────── */
  const todayStr = () => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  };
  const [historyDate,    setHistoryDate]    = useState(todayStr);
  const [paidSales,      setPaidSales]      = useState<PaidSale[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchPaidSales = useCallback(async (date: string) => {
    setHistoryLoading(true);
    try {
      const res = await apiRequest(`/sales/paid?date=${date}`) as
        { success?: boolean; data?: PaidSale[] } | PaidSale[];
      const data = Array.isArray(res) ? res : (res as { data?: PaidSale[] }).data ?? [];
      if (mountedRef.current) setPaidSales(data);
    } catch {
      if (mountedRef.current) setPaidSales([]);
    } finally {
      if (mountedRef.current) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen === "history") void fetchPaidSales(historyDate);
  }, [screen, historyDate, fetchPaidSales]);

  /* ── DnD sensors ──────────────────────────────────────── */
  const sensors = useSensors(
    // Mouse: empieza al mover 8px
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Touch: espera 150ms con dedo quieto (±12px) antes de activar drag
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 12 } }),
  );

  /* ── Pull-to-refresh sobre la grid de productos ───────── */
  const { containerRef: gridRef, pulling: gridPulling, progress: pullProgress } =
    usePullToRefresh(
      () => { void catalog.refresh(); },
      { enabled: !reorderMode },
    );

  /* ── Recargar órdenes al entrar al screen "orders" ────── */
  const refreshOrders = ordersH.refresh;
  useEffect(() => {
    if (screen === "orders") void refreshOrders();
  }, [screen, refreshOrders]);

  /* ── Computed ─────────────────────────────────────────── */
  const canAdmin = role === "admin" || role === "supervisor";

  /* ── Handlers compuestos ──────────────────────────────── */

  const handleNewOrder = () => {
    ticket.resetTicket();
    setEditingItemNotesId(null);
    setPendingRef("");
    setScreen("pos");
  };

  const openOrderInTicket = async (order: SavedOrder) => {
    const detail = await ordersH.loadOrderDetail(order.id);
    if (!detail || !mountedRef.current) return;
    ticket.loadOrder({
      items:      detail.items,
      notes:      detail.notes,
      orderId:    order.id,
      monthlyNum: order.monthly_number ?? null,
      reference:  order.reference ?? "",
    });
    setScreen("pos");
  };

  const handleSave = async () => {
    const saved = await checkout.saveOrder({
      cart:           ticket.cart,
      cartTotal:      ticket.cartTotal,
      currentOrderId: ticket.currentOrderId,
      pendingRef,
      orderRef:       ticket.orderRef,
      orderNotes:     ticket.orderNotes,
    });
    if (!saved || !mountedRef.current) return;
    ticket.applySavedOrder(saved);
    setPendingRef("");
    setShowRefSheet(false);
  };

  const handlePayClick = async ({ noTip = false }: { noTip?: boolean } = {}) => {
    /* Capturamos el total/ref ANTES de limpiar el ticket — así la
       pantalla "completed" muestra los datos correctos. */
    const cartTotalSnap = ticket.cartTotal;
    const orderRefSnap  = ticket.orderRef;

    const result = await checkout.payOrder({
      cart:           ticket.cart,
      cartTotal:      cartTotalSnap,
      currentOrderId: ticket.currentOrderId,
      orderRef:       orderRefSnap,
      orderNotes:     ticket.orderNotes,
      noTip,
    });
    if (!result || !mountedRef.current) return;

    setCompletedTotal(cartTotalSnap + Number(result.tip_amount ?? 0));
    setCompletedRef(orderRefSnap || "Venta");
    setCompletedSaleId(result.id ?? null);
    ticket.clearAfterPay();
    setEditingItemNotesId(null);
    setShowPaySheet(false);
    setScreen("completed");
  };

  const handleConfirmCancelOrder = async () => {
    if (!orderToCancel) return;
    const ok = await ordersH.cancelOrder(orderToCancel.id);
    if (ok && mountedRef.current) setOrderToCancel(null);
  };

  /* ── DnD handler (reordena productos en la grid) ──────── */
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      catalog.setProducts(prev => {
        const oldIdx = prev.findIndex(p => p.id === active.id);
        const newIdx = prev.findIndex(p => p.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  /* ============================================================
     SCREEN: Completed sale
  ============================================================ */
  if (screen === "completed") {
    return (
      <div className="ps-completed">
        <div className="ps-completed-check">
          <CheckIcon />
        </div>
        <h1 className="ps-completed-title">¡Cobrado!</h1>
        <p className="ps-completed-amount">{fmt(completedTotal)}</p>
        {completedRef && <p className="ps-completed-ref">{completedRef}</p>}
        <Button variant="primary" size="xl" onClick={handleNewOrder}>
          Nueva venta
        </Button>
        {completedSaleId != null && (
          <Button
            variant="secondary"
            size="lg"
            loading={printing.printLoading}
            onClick={() => void printing.printReceipt(completedSaleId)}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PrintIcon /><span>Imprimir ticket</span>
            </span>
          </Button>
        )}
        <Button variant="ghost" size="md" onClick={() => { handleNewOrder(); setScreen("orders"); }}>
          Ver órdenes guardadas
        </Button>
      </div>
    );
  }

  /* ============================================================
     SCREEN: Orders list
  ============================================================ */
  if (screen === "orders") {
    return (
      <>
      <div className="ps-orders-overlay">
        <div className="ps-orders-header">
          <button className="ps-icon-btn" onClick={() => setScreen("pos")} aria-label="Volver al POS">
            <BackIcon />
          </button>
          <h1 className="ps-orders-title">Órdenes guardadas</h1>
          <Button variant="primary" size="md" onClick={handleNewOrder}>
            + Nueva venta
          </Button>
        </div>

        {ordersH.loading ? (
          <div className="ps-center"><Spinner size="lg" /></div>
        ) : ordersH.orders.length === 0 ? (
          <div className="ps-center" style={{ flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 48, lineHeight: 1 }}>📋</span>
            <p style={{ fontWeight: 700, color: "var(--text-3)" }}>No hay órdenes guardadas</p>
          </div>
        ) : (
          <div className="ps-orders-list">
            {ordersH.orders.map(order => (
              <div key={order.id} className="ps-order-card">
                <div className="ps-order-info" onClick={() => void openOrderInTicket(order)}>
                  <div className="ps-order-ref">{order.reference || `Orden #${order.monthly_number ?? order.id}`}</div>
                  <div className="ps-order-meta">
                    {order.items_count != null ? `${order.items_count} ítems · ` : ""}
                    {new Date(order.created_at).toLocaleString("es-GT", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); void printing.sendKitchenTicket(order.id, ['kitchen']); }}
                    title="Enviar solo cocina"
                    disabled={printing.printLoading}
                    style={{
                      padding: "5px 7px",
                      background: "#16a34a",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      fontSize: 13,
                      cursor: printing.printLoading ? "not-allowed" : "pointer",
                      opacity: printing.printLoading ? 0.6 : 1,
                    }}
                  >
                    🍳
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); void printing.sendKitchenTicket(order.id, ['bar']); }}
                    title="Enviar solo barra"
                    disabled={printing.printLoading}
                    style={{
                      padding: "5px 7px",
                      background: "#2563eb",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      fontSize: 13,
                      cursor: printing.printLoading ? "not-allowed" : "pointer",
                      opacity: printing.printLoading ? 0.6 : 1,
                    }}
                  >
                    🥤
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); void printing.sendKitchenTicket(order.id, ['kitchen', 'bar']); }}
                    title="Enviar a cocina y barra"
                    disabled={printing.printLoading}
                    style={{
                      padding: "5px 7px",
                      background: "#f59e0b",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      fontSize: 13,
                      cursor: printing.printLoading ? "not-allowed" : "pointer",
                      opacity: printing.printLoading ? 0.6 : 1,
                    }}
                  >
                    📋
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOrderToCancel(order);
                    }}
                    title="Cancelar orden"
                    style={{
                      padding: "6px 8px",
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    🗑
                  </button>
                  <span className="ps-order-total">{fmt(toNum(order.total))}</span>
                  <span className="ps-order-chevron"><ChevronRightIcon /></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {orderToCancel && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: "var(--surface-1, #fff)", borderRadius: 12, padding: "28px 24px",
            maxWidth: 340, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Cancelar orden</h2>
            <p style={{ margin: "12px 0 24px", color: "var(--text-2, #555)" }}>
              ¿Deseas cancelar <strong>{orderToCancel.reference || `Orden #${orderToCancel.monthly_number ?? orderToCancel.id}`}</strong>?
              Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setOrderToCancel(null)}
                disabled={ordersH.canceling}
                style={{
                  padding: "10px 20px", borderRadius: 8, border: "1px solid #d1d5db",
                  background: "transparent", cursor: ordersH.canceling ? "not-allowed" : "pointer",
                  fontWeight: 600, fontSize: 15,
                }}
              >
                Volver
              </button>
              <button
                onClick={() => void handleConfirmCancelOrder()}
                disabled={ordersH.canceling}
                style={{
                  padding: "10px 20px", borderRadius: 8, border: "none",
                  background: "#ef4444", color: "white",
                  cursor: ordersH.canceling ? "not-allowed" : "pointer",
                  fontWeight: 600, fontSize: 15, opacity: ordersH.canceling ? 0.7 : 1,
                }}
              >
                {ordersH.canceling ? "Cancelando..." : "Sí, cancelar"}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  /* ============================================================
     SCREEN: History (ventas cobradas)
  ============================================================ */
  if (screen === "history") {
    const totalHoy   = paidSales.reduce((s, v) => s + toNum(v.total), 0);
    const totalTips  = paidSales.reduce((s, v) => s + toNum(v.tip_amount), 0);

    const fmtDateTime = (iso: string | null) => {
      if (!iso) return "";
      return new Date(iso).toLocaleString("es-GT", { dateStyle: "short", timeStyle: "short" });
    };

    return (
      <div className="ps-history-overlay">
        <div className="ps-history-header">
          <button className="ps-icon-btn" onClick={() => setScreen("pos")} aria-label="Volver al POS">
            <BackIcon />
          </button>
          <h1 className="ps-history-title">Ventas cobradas</h1>
          <input
            type="date"
            className="ps-history-date"
            value={historyDate}
            onChange={e => setHistoryDate(e.target.value)}
          />
        </div>

        {historyLoading ? (
          <div className="ps-center"><Spinner size="lg" /></div>
        ) : paidSales.length === 0 ? (
          <div className="ps-center" style={{ flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 48, lineHeight: 1 }}>🧾</span>
            <p style={{ fontWeight: 700, color: "var(--text-3)" }}>Sin ventas cobradas en esta fecha</p>
          </div>
        ) : (
          <div className="ps-history-list">
            {paidSales.map(sale => {
              const tip = toNum(sale.tip_amount);
              return (
                <div key={sale.id} className="ps-history-card">
                  <div className="ps-history-info">
                    <div className="ps-history-ref">
                      {sale.reference || `Venta #${sale.monthly_number ?? sale.id}`}
                    </div>
                    <div className="ps-history-meta">
                      <span className="ps-history-seller">👤 {sale.user_name}</span>
                      <span>· {fmtDateTime(sale.paid_at ?? sale.created_at)}</span>
                    </div>
                  </div>
                  <div className="ps-history-amounts">
                    <span className="ps-history-total">{fmt(toNum(sale.total))}</span>
                    {tip > 0 && (
                      <span className="ps-history-tip">+ {fmt(tip)} propina</span>
                    )}
                  </div>
                  <button
                    className="ps-history-print-btn"
                    disabled={printing.printLoading}
                    onClick={() => void printing.printReceipt(sale.id)}
                    title="Reimprimir ticket"
                  >
                    <PrintIcon />
                    <span>Imprimir</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {!historyLoading && paidSales.length > 0 && (
          <div className="ps-history-summary">
            <div>
              <div className="ps-history-summary-label">Total del día</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 1 }}>
                {paidSales.length} venta{paidSales.length !== 1 ? "s" : ""}
                {totalTips > 0 && ` · Propinas: ${fmt(totalTips)}`}
              </div>
            </div>
            <span className="ps-history-summary-amount">{fmt(totalHoy)}</span>
          </div>
        )}
      </div>
    );
  }

  /* ============================================================
     SCREEN: Main POS (pos)
  ============================================================ */

  const productIds = catalog.filteredProducts.map(p => p.id);

  return (
    <>
      <div className="ps-layout">

        {/* ── Sidebar ───────────────────────────────────── */}
        <aside className="ps-sidebar">
          <button
            className={`ps-sidebar-btn${screen === "pos" ? " ps-sidebar-btn--active" : ""}`}
            onClick={() => setScreen("pos")}
            aria-label="POS"
          >
            <CartIcon />
            <span>POS</span>
          </button>

          <button
            className="ps-sidebar-btn"
            onClick={() => setScreen("orders")}
            aria-label="Órdenes"
          >
            <ListIcon />
            <span>Órdenes</span>
          </button>

          <button
            className="ps-sidebar-btn"
            onClick={() => setScreen("history")}
            aria-label="Ventas cobradas"
          >
            <ReceiptIcon />
            <span>Cobradas</span>
          </button>

          <div className="ps-sidebar-spacer" />

          {canAdmin && (
            <button
              className="ps-sidebar-btn"
              onClick={onGoToAdmin}
              aria-label="Administración"
            >
              <AdminIcon />
              <span>Admin</span>
            </button>
          )}

          <button
            className="ps-sidebar-btn ps-sidebar-btn--danger"
            onClick={onLogout}
            aria-label="Cerrar sesión"
          >
            <LogoutIcon />
            <span>Salir</span>
          </button>
        </aside>

        {/* ── Products ──────────────────────────────────── */}
        <main className="ps-products">

          {/* Top bar */}
          <div className="ps-topbar">
            <div className="ps-search-wrap">
              <span className="ps-search-icon"><SearchIcon /></span>
              <input
                className="ps-search"
                placeholder="Buscar producto..."
                value={catalog.search}
                onChange={e => catalog.setSearch(e.target.value)}
                type="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {catalog.search && (
                <button
                  className="ps-search-clear"
                  onClick={() => catalog.setSearch("")}
                  onPointerDown={e => e.preventDefault()}
                  aria-label="Borrar búsqueda"
                >
                  <XIcon />
                </button>
              )}
            </div>
            <button
              className={`ps-topbar-btn${reorderMode ? " ps-topbar-btn--active" : ""}`}
              onClick={() => setReorderMode(p => !p)}
              aria-label={reorderMode ? "Salir del modo reordenar" : "Reordenar productos"}
            >
              <ReorderIcon />
              <span>Orden</span>
            </button>
          </div>

          {/* Reorder mode banner */}
          {reorderMode && (
            <div className="ps-reorder-bar">
              <span className="ps-reorder-text">Arrastra los productos para reordenar</span>
              <button className="ps-reorder-done" onClick={() => setReorderMode(false)}>
                Listo
              </button>
            </div>
          )}

          {/* Category chips */}
          <div className="ps-cats" role="list">
            <button
              className={`ps-cat-chip${catalog.selectedCat === null ? " ps-cat-chip--active" : ""}`}
              onClick={() => catalog.setSelectedCat(null)}
              role="listitem"
            >
              Todas
            </button>
            {catalog.categories.map(cat => (
              <button
                key={cat.id}
                className={`ps-cat-chip${catalog.selectedCat === cat.id ? " ps-cat-chip--active" : ""}`}
                onClick={() => catalog.setSelectedCat(catalog.selectedCat === cat.id ? null : cat.id)}
                role="listitem"
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className={`ps-grid-wrap${reorderMode ? " ps-grid-wrap--reorder" : ""}`} ref={gridRef}>
            {/* Pull-to-refresh indicator */}
            {gridPulling && (
              <div className="ps-ptr-indicator" style={{ "--ptr-progress": pullProgress } as React.CSSProperties}>
                <Spinner size="sm" />
                <span>{pullProgress >= 1 ? "Soltar para actualizar" : "Desliza para actualizar"}</span>
              </div>
            )}
            {catalog.loading ? (
              <div className="ps-skeleton-grid">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="ps-product-skeleton" />
                ))}
              </div>
            ) : catalog.filteredProducts.length === 0 ? (
              <div className="ps-no-results">
                <p>Sin resultados</p>
                {catalog.search && <p>Intenta con otro término de búsqueda</p>}
              </div>
            ) : reorderMode ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={e => setActiveDragId(Number(e.active.id))}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveDragId(null)}
              >
                <SortableContext items={productIds} strategy={rectSortingStrategy}>
                  <div className="ps-grid">
                    {catalog.filteredProducts.map(product => (
                      <SortableProductCard
                        key={product.id}
                        product={product}
                        isFlashing={ticket.flashId === product.id}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeDragId != null && (() => {
                    const p = catalog.products.find(x => x.id === activeDragId);
                    return p ? (
                      <div className="ps-product-card ps-product-card--dragging">
                        <span className="ps-product-name">{p.name}</span>
                        <span className="ps-product-price">{fmt(toNum(p.price))}</span>
                      </div>
                    ) : null;
                  })()}
                </DragOverlay>
              </DndContext>
            ) : (
              <div className="ps-grid">
                {catalog.filteredProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAdd={ticket.addToCart}
                    isFlashing={ticket.flashId === product.id}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        {/* ── Ticket ────────────────────────────────────── */}
        <section className="ps-ticket" aria-label="Ticket actual">

          <div className="ps-ticket-header">
            <div className="ps-ticket-label">Ticket actual</div>
            <div className="ps-ticket-ref">
              {ticket.orderRef || (ticket.currentOrderId ? `Orden #${ticket.currentOrderMonthlyNum ?? ticket.currentOrderId}` : "Nueva venta")}
            </div>
          </div>

          {ticket.cart.length === 0 ? (
            <div className="ps-ticket-empty">
              <div className="ps-ticket-empty-icon"><EmptyTicketIcon /></div>
              <p>Toca un producto para agregarlo al ticket</p>
            </div>
          ) : (
            <div className="ps-ticket-items">
              {ticket.cart.map(item => (
                <TicketItemRow
                  key={item.productId}
                  item={item}
                  isEditingNotes={editingItemNotesId === item.productId}
                  onIncrease={() => ticket.increaseQty(item.productId)}
                  onDecrease={() => ticket.decreaseQty(item.productId)}
                  onEditQty={() => {
                    setQtyItem(item);
                    setQtyValue(String(item.quantity));
                    setShowQtySheet(true);
                  }}
                  onToggleNotes={() => setEditingItemNotesId(
                    editingItemNotesId === item.productId ? null : item.productId
                  )}
                  onCloseNotes={() => setEditingItemNotesId(null)}
                  onSetNotes={(notes) => ticket.setItemNotes(item.productId, notes)}
                  onRemove={() => ticket.removeItem(item.productId)}
                />
              ))}
            </div>
          )}

          <div className="ps-ticket-footer">
            <div style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb", marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#4b5563", display: "block", marginBottom: 4 }}>
                📋 Nota general:
              </label>
              <textarea
                placeholder="Ej: mesa 5, alérgico..."
                value={ticket.orderNotes}
                onChange={(e) => ticket.setOrderNotes(e.target.value)}
                rows={2}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  border: "1px solid #d1d5db",
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div className="ps-ticket-total">
              <span className="ps-ticket-total-label">Total</span>
              <span className="ps-ticket-total-amount">{fmt(ticket.cartTotal)}</span>
            </div>

            <Button
              variant="secondary"
              size="lg"
              fullWidth
              loading={checkout.saveLoading}
              disabled={ticket.cart.length === 0}
              onClick={() => { if (ticket.cart.length > 0) setShowRefSheet(true); }}
            >
              Guardar orden
            </Button>

            <Button
              variant="secondary"
              size="lg"
              fullWidth
              disabled={ticket.cart.length === 0}
              onClick={() => { if (ticket.cart.length > 0) setShowSplitSheet(true); }}
            >
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 3h5v5"/><path d="M8 3H3v5"/>
                  <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/>
                  <path d="m15 9 6-6"/>
                </svg>
                Dividir cuenta
              </span>
            </Button>

            <Button
              variant="primary"
              size="xl"
              fullWidth
              disabled={ticket.cart.length === 0}
              onClick={() => {
                if (ticket.cart.length === 0) { navigator.vibrate?.([10, 80, 10]); return; }
                setShowPaySheet(true);
              }}
            >
              {ticket.cart.length > 0 ? `Cobrar ${fmt(ticket.cartTotal)}` : "Cobrar"}
            </Button>
          </div>
        </section>
      </div>

      {/* ── Qty edit BottomSheet ──────────────────────── */}
      <BottomSheet
        open={showQtySheet}
        onClose={() => setShowQtySheet(false)}
        height="auto"
        title={qtyItem ? `Cantidad — ${qtyItem.name}` : "Cantidad"}
      >
        <div style={{ padding: "0 16px 24px" }}>
          <NumKeypad
            value={qtyValue}
            onChange={setQtyValue}
            showConfirm
            onConfirm={() => {
              if (qtyItem) ticket.setItemQty(qtyItem.productId, parseInt(qtyValue, 10) || 1);
              setShowQtySheet(false);
            }}
            displayLabel="Ingresa la cantidad"
          />
        </div>
      </BottomSheet>

      {/* ── Pay BottomSheet ───────────────────────────── */}
      <BottomSheet
        open={showPaySheet}
        onClose={() => !checkout.payLoading && !checkout.payNoTipLoading && setShowPaySheet(false)}
        height="auto"
        title="Confirmar cobro"
        draggable={!checkout.payLoading && !checkout.payNoTipLoading}
      >
        <div style={{ padding: "0 20px 32px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Total / desglose con propina */}
          <div style={{ textAlign: "center", paddingBottom: 4 }}>
            {checkout.tipPercentage > 0 ? (
              <>
                <p className="ps-pay-total-label">Subtotal</p>
                <p className="ps-pay-total-amount" style={{ fontSize: "1.4rem" }}>{fmt(ticket.cartTotal)}</p>
                <p className="ps-pay-total-label" style={{ marginTop: 6 }}>
                  Propina ({checkout.tipPercentage}%)&nbsp;&nbsp;
                  <span style={{ fontWeight: 700 }}>
                    {fmt(Math.round(ticket.cartTotal * checkout.tipPercentage) / 100)}
                  </span>
                </p>
                <p className="ps-pay-total-label" style={{ marginTop: 4 }}>Total</p>
                <p className="ps-pay-total-amount">
                  {fmt(ticket.cartTotal + Math.round(ticket.cartTotal * checkout.tipPercentage) / 100)}
                </p>
              </>
            ) : (
              <>
                <p className="ps-pay-total-label">Total a cobrar</p>
                <p className="ps-pay-total-amount">{fmt(ticket.cartTotal)}</p>
              </>
            )}
          </div>

          {/* Confirmar cobro (flujo normal) */}
          <Button
            variant="primary"
            size="xl"
            fullWidth
            loading={checkout.payLoading}
            disabled={checkout.payNoTipLoading}
            onClick={() => void handlePayClick()}
          >
            Confirmar cobro
          </Button>

          {/* Divisor */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 12, color: "var(--text-3)", fontWeight: 600,
          }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span>o bien</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          {/* Cobrar sin propina */}
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            loading={checkout.payNoTipLoading}
            disabled={checkout.payLoading}
            onClick={() => void handlePayClick({ noTip: true })}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <line x1="5" y1="5" x2="19" y2="19" strokeOpacity=".4"/>
              </svg>
              Cobrar sin propina
            </span>
          </Button>

          {/* Cancelar */}
          <Button
            variant="ghost"
            size="md"
            fullWidth
            disabled={checkout.payLoading || checkout.payNoTipLoading}
            onClick={() => setShowPaySheet(false)}
          >
            Cancelar
          </Button>
        </div>
      </BottomSheet>

      {/* ── Split bill sheet ─────────────────────────── */}
      <SplitBillSheet
        open={showSplitSheet}
        onClose={() => setShowSplitSheet(false)}
        cart={ticket.cart}
        cartTotal={ticket.cartTotal}
        orderRef={ticket.orderRef}
        currentOrderId={ticket.currentOrderId}
        onAllPaid={(saleId) => {
          /* Capturamos los snapshots ANTES de limpiar — la pantalla
             "completed" tiene que mostrar el total y la ref originales. */
          const cartTotalSnap = ticket.cartTotal;
          const orderRefSnap  = ticket.orderRef;
          setCompletedSaleId(saleId);
          setCompletedTotal(cartTotalSnap);
          setCompletedRef(orderRefSnap);
          ticket.clearAfterPay();
          setShowSplitSheet(false);
          setScreen("completed");
        }}
      />

      {/* ── Save / ref BottomSheet ────────────────────── */}
      <BottomSheet
        open={showRefSheet}
        onClose={() => !checkout.saveLoading && setShowRefSheet(false)}
        height="auto"
        title="Guardar orden"
        draggable={!checkout.saveLoading}
      >
        <div style={{ padding: "0 20px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          <input
            className="ps-ref-input"
            placeholder="Referencia — mesa, cliente... (opcional)"
            value={pendingRef}
            onChange={e => setPendingRef(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void handleSave(); }}
            autoComplete="off"
          />
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={checkout.saveLoading}
            onClick={() => void handleSave()}
          >
            Guardar
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
