import { useCallback, useMemo, useState } from "react";
import { useToast } from "@pos/ui-kit";
import type { Product, CartItem } from "@pos/types";
import { toNum } from "./format";

export interface LoadOrderInput {
  items:        CartItem[];
  notes:        string;
  orderId:      number;
  monthlyNum:   number | null;
  reference:    string;
}

export interface SavedOrderApplyInput {
  id:              number;
  monthly_number?: number | null;
  reference?:      string;
}

export interface UseTicketResult {
  cart:                   CartItem[];
  cartTotal:              number;
  currentOrderId:         number | null;
  currentOrderMonthlyNum: number | null;
  orderRef:               string;
  orderNotes:             string;
  /** id del producto que acaba de agregarse (para animación flash). null cuando no hay flash activo. */
  flashId:                number | null;

  setOrderRef:            (v: string) => void;
  setOrderNotes:          (v: string) => void;

  addToCart:              (product: Product) => void;
  increaseQty:            (productId: number) => void;
  decreaseQty:            (productId: number) => void;
  removeItem:             (productId: number) => void;
  setItemQty:             (productId: number, qty: number) => void;
  setItemNotes:           (productId: number, notes: string) => void;

  /** Limpia TODO (carrito, notas, ids, ref, monthlyNum). Equivalente a "Nueva venta". */
  resetTicket:            () => void;
  /**
   * Limpia el estado tras un cobro exitoso.
   * Replica la conducta original: NO toca currentOrderMonthlyNum.
   */
  clearAfterPay:          () => void;
  /** Carga el detalle de una orden guardada en el ticket activo. */
  loadOrder:              (input: LoadOrderInput) => void;
  /** Aplica el resultado del backend tras `saveOrder` (id/monthly_number/reference). */
  applySavedOrder:        (saved: SavedOrderApplyInput) => void;
}

/**
 * Hook headless para el carrito/ticket actual del POS.
 *
 * Encapsula:
 *   - estado del carrito y orden activa (id, ref, notas)
 *   - operaciones de modificación (add/qty/notes/remove con undo)
 *   - el "flash" de feedback al agregar (con vibración táctil)
 */
export function useTicket(): UseTicketResult {
  const { show } = useToast();

  const [cart,                   setCart]                   = useState<CartItem[]>([]);
  const [currentOrderId,         setCurrentOrderId]         = useState<number | null>(null);
  const [currentOrderMonthlyNum, setCurrentOrderMonthlyNum] = useState<number | null>(null);
  const [orderRef,               setOrderRef]               = useState("");
  const [orderNotes,             setOrderNotes]             = useState("");
  const [flashId,                setFlashId]                = useState<number | null>(null);

  const cartTotal = useMemo(
    () => cart.reduce((s, i) => s + i.price * i.quantity, 0),
    [cart],
  );

  const addToCart = useCallback((product: Product) => {
    const price = toNum(product.price);
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { productId: product.id, name: product.name, price, quantity: 1 }];
    });
    setFlashId(product.id);
    navigator.vibrate?.(10);
    setTimeout(() => setFlashId(null), 400);
  }, []);

  const increaseQty = useCallback((productId: number) => {
    setCart(prev =>
      prev.map(i => i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i),
    );
  }, []);

  const decreaseQty = useCallback((productId: number) => {
    setCart(prev => {
      const item = prev.find(i => i.productId === productId);
      if (!item) return prev;
      if (item.quantity <= 1) return prev.filter(i => i.productId !== productId);
      return prev.map(i =>
        i.productId === productId ? { ...i, quantity: i.quantity - 1 } : i,
      );
    });
  }, []);

  const removeItem = useCallback((productId: number) => {
    let removed: CartItem | undefined;
    setCart(prev => {
      removed = prev.find(i => i.productId === productId);
      return prev.filter(i => i.productId !== productId);
    });
    if (removed) {
      const item = removed;
      show(`"${item.name}" eliminado`, {
        type: "info",
        action: {
          label: "Deshacer",
          onClick: () => setCart(prev => {
            if (prev.some(i => i.productId === productId)) return prev;
            return [...prev, item];
          }),
        },
      });
    }
  }, [show]);

  const setItemQty = useCallback((productId: number, qty: number) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(i => i.productId !== productId));
      return;
    }
    setCart(prev =>
      prev.map(i => i.productId === productId ? { ...i, quantity: qty } : i),
    );
  }, []);

  const setItemNotes = useCallback((productId: number, notes: string) => {
    setCart(prev =>
      prev.map(i =>
        i.productId === productId ? { ...i, notes: notes || undefined } : i,
      ),
    );
  }, []);

  const resetTicket = useCallback(() => {
    setCart([]);
    setOrderNotes("");
    setCurrentOrderId(null);
    setCurrentOrderMonthlyNum(null);
    setOrderRef("");
  }, []);

  const clearAfterPay = useCallback(() => {
    setCart([]);
    setOrderNotes("");
    setCurrentOrderId(null);
    setOrderRef("");
    /* NOTA: currentOrderMonthlyNum se preserva (mismo comportamiento original) */
  }, []);

  const loadOrder = useCallback((input: LoadOrderInput) => {
    setCart(input.items);
    setOrderNotes(input.notes || "");
    setCurrentOrderId(input.orderId);
    setCurrentOrderMonthlyNum(input.monthlyNum);
    setOrderRef(input.reference ?? "");
  }, []);

  const applySavedOrder = useCallback((saved: SavedOrderApplyInput) => {
    setCurrentOrderId(saved.id);
    setCurrentOrderMonthlyNum(saved.monthly_number ?? null);
    setOrderRef(saved.reference ?? "");
  }, []);

  return {
    cart,
    cartTotal,
    currentOrderId,
    currentOrderMonthlyNum,
    orderRef,
    orderNotes,
    flashId,

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
