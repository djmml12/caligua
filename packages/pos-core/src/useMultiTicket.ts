import { useCallback, useMemo, useRef, useState } from "react";
import { useToast } from "@pos/ui-kit";
import type { Product, CartItem } from "@pos/types";
import { toNum } from "./format";
import type { LoadOrderInput, SavedOrderApplyInput } from "./useTicket";

export interface TicketSlot {
  id: string;
  cart: CartItem[];
  currentOrderId: number | null;
  currentOrderMonthlyNum: number | null;
  orderRef: string;
  orderNotes: string;
}

export interface UseMultiTicketResult {
  /* Datos del slot activo (misma API que UseTicketResult) */
  cart: CartItem[];
  cartTotal: number;
  currentOrderId: number | null;
  currentOrderMonthlyNum: number | null;
  orderRef: string;
  orderNotes: string;
  flashId: number | null;

  /* Gestión multi-slot */
  slots: TicketSlot[];
  activeIndex: number;
  createTicket: () => void;
  switchTicket: (index: number) => void;
  closeTicket: (index: number) => void;

  /* Mutaciones sobre el slot activo */
  setOrderRef: (v: string) => void;
  setOrderNotes: (v: string) => void;
  addToCart: (product: Product) => void;
  increaseQty: (productId: number) => void;
  decreaseQty: (productId: number) => void;
  removeItem: (productId: number) => void;
  setItemQty: (productId: number, qty: number) => void;
  setItemNotes: (productId: number, notes: string) => void;
  resetTicket: () => void;
  clearAfterPay: () => void;
  loadOrder: (input: LoadOrderInput) => void;
  applySavedOrder: (saved: SavedOrderApplyInput) => void;
}

function newSlot(): TicketSlot {
  return {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    cart: [],
    currentOrderId: null,
    currentOrderMonthlyNum: null,
    orderRef: "",
    orderNotes: "",
  };
}

export function useMultiTicket(): UseMultiTicketResult {
  const { show } = useToast();

  const [slots, setSlots] = useState<TicketSlot[]>(() => [newSlot()]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [flashId, setFlashId] = useState<number | null>(null);

  /* Refs para leer valores actuales de forma síncrona dentro de callbacks */
  const slotsLenRef   = useRef(1);
  const activeIdxRef  = useRef(0);
  slotsLenRef.current  = slots.length;
  activeIdxRef.current = activeIndex;

  const active = slots[activeIndex] ?? slots[0]!;

  const cartTotal = useMemo(
    () => active.cart.reduce((s, i) => s + i.price * i.quantity, 0),
    [active.cart],
  );

  /* ── Multi-slot ──────────────────────────────────────────── */

  const createTicket = useCallback(() => {
    const idx = slotsLenRef.current;
    setSlots(prev => [...prev, newSlot()]);
    setActiveIndex(idx);
  }, []);

  const switchTicket = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const closeTicket = useCallback((index: number) => {
    setSlots(prev => {
      if (prev.length === 1) {
        /* Último slot: resetear en lugar de eliminar */
        return [{ ...newSlot(), id: prev[0].id }];
      }
      return prev.filter((_, i) => i !== index);
    });
    setActiveIndex(prev => {
      if (index < prev) return prev - 1;
      if (index === prev) return Math.max(0, prev - 1);
      return prev;
    });
  }, []);

  /* ── Mutación del slot activo ─────────────────────────────── */

  /* Usar ref garantiza que siempre se aplica sobre el slot correcto,
     incluso cuando React procesa actualizaciones de estado en lote. */
  const mutate = useCallback(
    (fn: (s: TicketSlot) => TicketSlot) => {
      const idx = activeIdxRef.current;
      setSlots(prev => prev.map((s, i) => (i === idx ? fn(s) : s)));
    },
    [],
  );

  const setOrderRef = useCallback((v: string) => {
    mutate(s => ({ ...s, orderRef: v }));
  }, [mutate]);

  const setOrderNotes = useCallback((v: string) => {
    mutate(s => ({ ...s, orderNotes: v }));
  }, [mutate]);

  const addToCart = useCallback((product: Product) => {
    const price = toNum(product.price);
    mutate(s => {
      const existing = s.cart.find(i => i.productId === product.id);
      const cart = existing
        ? s.cart.map(i =>
            i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i,
          )
        : [...s.cart, { productId: product.id, name: product.name, price, quantity: 1 }];
      return { ...s, cart };
    });
    setFlashId(product.id);
    navigator.vibrate?.(10);
    setTimeout(() => setFlashId(null), 400);
  }, [mutate]);

  const increaseQty = useCallback((productId: number) => {
    mutate(s => ({
      ...s,
      cart: s.cart.map(i =>
        i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i,
      ),
    }));
  }, [mutate]);

  const decreaseQty = useCallback((productId: number) => {
    mutate(s => {
      const item = s.cart.find(i => i.productId === productId);
      if (!item) return s;
      const cart =
        item.quantity <= 1
          ? s.cart.filter(i => i.productId !== productId)
          : s.cart.map(i =>
              i.productId === productId ? { ...i, quantity: i.quantity - 1 } : i,
            );
      return { ...s, cart };
    });
  }, [mutate]);

  const removeItem = useCallback((productId: number) => {
    const item = active.cart.find(i => i.productId === productId);
    if (!item) return;
    mutate(s => ({ ...s, cart: s.cart.filter(i => i.productId !== productId) }));
    show(`"${item.name}" eliminado`, {
      type: "info",
      action: {
        label: "Deshacer",
        onClick: () =>
          mutate(s => {
            if (s.cart.some(i => i.productId === productId)) return s;
            return { ...s, cart: [...s.cart, item] };
          }),
      },
    });
  }, [active.cart, mutate, show]);

  const setItemQty = useCallback((productId: number, qty: number) => {
    mutate(s => {
      if (qty <= 0)
        return { ...s, cart: s.cart.filter(i => i.productId !== productId) };
      return {
        ...s,
        cart: s.cart.map(i =>
          i.productId === productId ? { ...i, quantity: qty } : i,
        ),
      };
    });
  }, [mutate]);

  const setItemNotes = useCallback((productId: number, notes: string) => {
    mutate(s => ({
      ...s,
      cart: s.cart.map(i =>
        i.productId === productId ? { ...i, notes: notes || undefined } : i,
      ),
    }));
  }, [mutate]);

  const resetTicket = useCallback(() => {
    mutate(s => ({ ...newSlot(), id: s.id }));
  }, [mutate]);

  const clearAfterPay = useCallback(() => {
    mutate(s => ({
      ...s,
      cart: [],
      orderNotes: "",
      currentOrderId: null,
      orderRef: "",
      /* currentOrderMonthlyNum se preserva (comportamiento original) */
    }));
  }, [mutate]);

  const loadOrder = useCallback((input: LoadOrderInput) => {
    mutate(s => ({
      ...s,
      cart: input.items,
      orderNotes: input.notes || "",
      currentOrderId: input.orderId,
      currentOrderMonthlyNum: input.monthlyNum,
      orderRef: input.reference ?? "",
    }));
  }, [mutate]);

  const applySavedOrder = useCallback((saved: SavedOrderApplyInput) => {
    mutate(s => ({
      ...s,
      currentOrderId: saved.id,
      currentOrderMonthlyNum: saved.monthly_number ?? null,
      orderRef: saved.reference ?? s.orderRef,
    }));
  }, [mutate]);

  return {
    cart: active.cart,
    cartTotal,
    currentOrderId: active.currentOrderId,
    currentOrderMonthlyNum: active.currentOrderMonthlyNum,
    orderRef: active.orderRef,
    orderNotes: active.orderNotes,
    flashId,

    slots,
    activeIndex,
    createTicket,
    switchTicket,
    closeTicket,

    setOrderRef,
    setOrderNotes,
    addToCart,
    increaseQty,
    decreaseQty,
    removeItem,
    setItemQty,
    setItemNotes,
    resetTicket,
    clearAfterPay,
    loadOrder,
    applySavedOrder,
  };
}
