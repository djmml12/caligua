import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@pos/api-client";
import { useToast }   from "@pos/ui-kit";
import type { CartItem } from "@pos/types";

export interface SaveOrderInput {
  cart:           CartItem[];
  cartTotal:      number;
  currentOrderId: number | null;
  /** Si está presente, sobreescribe orderRef. Útil cuando el usuario edita la ref en un sheet. */
  pendingRef?:    string;
  orderRef:       string;
  orderNotes:     string;
}

export interface SaveOrderResult {
  id:              number;
  monthly_number?: number;
  reference:       string;
}

export interface PayOrderInput {
  cart:           CartItem[];
  cartTotal:      number;
  currentOrderId: number | null;
  orderRef:       string;
  orderNotes:     string;
  /** Cobrar sin propina: envía tip_amount=0 y tip_percentage=0 explícitamente. */
  noTip?:         boolean;
}

export interface PayOrderResult {
  id?:         number;
  tip_amount?: number;
}

export interface UseCheckoutResult {
  /** Porcentaje de propina configurado por el negocio (settings/tip), 0 si no hay. */
  tipPercentage:    number;
  saveLoading:      boolean;
  payLoading:       boolean;
  payNoTipLoading:  boolean;
  /** POST/PUT a /orders. Devuelve null si el carrito está vacío o falla la red. */
  saveOrder:        (input: SaveOrderInput) => Promise<SaveOrderResult | null>;
  /** POST a /sales. Devuelve null si el carrito está vacío o falla la red. */
  payOrder:         (input: PayOrderInput) => Promise<PayOrderResult | null>;
}

/**
 * Hook headless para guardar órdenes y cobrar ventas.
 * - Carga el porcentaje de propina al montar (settings/tip).
 * - Mantiene flags de loading separados para "guardar", "cobrar" y "cobrar sin propina".
 */
export function useCheckout(): UseCheckoutResult {
  const { show } = useToast();
  const mountedRef = useRef(true);

  const [tipPercentage,   setTipPercentage]   = useState(0);
  const [saveLoading,     setSaveLoading]     = useState(false);
  const [payLoading,      setPayLoading]      = useState(false);
  const [payNoTipLoading, setPayNoTipLoading] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    apiRequest("/settings/tip")
      .then((r: unknown) => {
        const pct = Number((r as Record<string, unknown>)?.value ?? 0);
        if (mountedRef.current) setTipPercentage(isFinite(pct) ? pct : 0);
      })
      .catch(() => {});
    return () => { mountedRef.current = false; };
  }, []);

  const saveOrder = useCallback(async (input: SaveOrderInput): Promise<SaveOrderResult | null> => {
    if (input.cart.length === 0) {
      show("El carrito está vacío", { type: "warning" });
      return null;
    }
    setSaveLoading(true);
    try {
      const body = {
        reference: input.pendingRef || input.orderRef || undefined,
        items:     input.cart.map(i => ({
          product_id: i.productId,
          quantity:   i.quantity,
          price:      i.price,
          notes:      i.notes || null,
        })),
        total:    input.cartTotal,
        order_id: input.currentOrderId ?? undefined,
        notes:    input.orderNotes || null,
      };
      const saved = await apiRequest(
        input.currentOrderId ? `/orders/${input.currentOrderId}` : "/orders",
        { method: input.currentOrderId ? "PUT" : "POST", body: JSON.stringify(body) },
      ) as SaveOrderResult;

      if (mountedRef.current) {
        show(`Orden "${saved.reference}" guardada`, { type: "success" });
      }
      return saved;
    } catch (err: unknown) {
      if (mountedRef.current) {
        show(err instanceof Error ? err.message : "Error al guardar", { type: "error" });
      }
      return null;
    } finally {
      if (mountedRef.current) setSaveLoading(false);
    }
  }, [show]);

  const payOrder = useCallback(async (input: PayOrderInput): Promise<PayOrderResult | null> => {
    if (input.cart.length === 0) return null;

    if (input.noTip) setPayNoTipLoading(true);
    else             setPayLoading(true);

    try {
      const body: Record<string, unknown> = {
        items:     input.cart.map(i => ({
          product_id: i.productId,
          quantity:   i.quantity,
          price:      i.price,
          notes:      i.notes || null,
        })),
        total:     input.cartTotal,
        order_id:  input.currentOrderId ?? undefined,
        reference: input.orderRef || undefined,
        notes:     input.orderNotes || null,
      };
      if (input.noTip) {
        body.tip_amount     = 0;
        body.tip_percentage = 0;
      }
      const result = await apiRequest("/sales", {
        method: "POST",
        body:   JSON.stringify(body),
      }) as PayOrderResult;

      if (mountedRef.current) {
        navigator.vibrate?.([20, 60, 20, 60, 40]);
      }
      return result;
    } catch (err: unknown) {
      if (mountedRef.current) {
        show(err instanceof Error ? err.message : "Error al cobrar", { type: "error" });
      }
      return null;
    } finally {
      if (mountedRef.current) {
        setPayLoading(false);
        setPayNoTipLoading(false);
      }
    }
  }, [show]);

  return { tipPercentage, saveLoading, payLoading, payNoTipLoading, saveOrder, payOrder };
}
