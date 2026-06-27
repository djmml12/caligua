import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@pos/api-client";
import { useToast }   from "@pos/ui-kit";
import type { CartItem, SavedOrder } from "@pos/types";
import { toNum } from "./format";

export interface OrderDetail {
  items: CartItem[];
  notes: string;
}

export interface UseOrdersResult {
  orders:          SavedOrder[];
  loading:         boolean;
  canceling:       boolean;
  refresh:         () => Promise<void>;
  loadOrderDetail: (orderId: number) => Promise<OrderDetail | null>;
  cancelOrder:     (orderId: number) => Promise<boolean>;
}

/**
 * Hook headless para órdenes guardadas (status=pending).
 * - `refresh()` carga la lista; el componente decide cuándo invocarlo.
 * - `loadOrderDetail()` resuelve los items para "abrir" una orden en el ticket.
 * - `cancelOrder()` cancela una venta (POST /sales/:id/cancel) y refresca la lista.
 */
export function useOrders(): UseOrdersResult {
  const { show } = useToast();
  const mountedRef = useRef(true);

  const [orders,    setOrders]    = useState<SavedOrder[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/orders?status=pending") as SavedOrder[];
      if (mountedRef.current) setOrders(data ?? []);
    } catch {
      if (mountedRef.current) show("Error cargando órdenes", { type: "error" });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [show]);

  const loadOrderDetail = useCallback(async (orderId: number): Promise<OrderDetail | null> => {
    try {
      const detail = await apiRequest(`/orders/${orderId}`) as {
        items?: Array<{
          product_id:    number;
          product_name?: string;
          name?:         string;
          price:         number | string;
          quantity:      number;
          notes?:        string;
        }>;
        notes?: string;
      };

      const items: CartItem[] = (detail.items ?? []).map(i => ({
        productId: i.product_id,
        name:      i.product_name ?? i.name ?? "Producto",
        price:     toNum(i.price),
        quantity:  i.quantity,
        notes:     i.notes || undefined,
      }));

      return { items, notes: detail.notes || "" };
    } catch {
      if (mountedRef.current) show("Error cargando orden", { type: "error" });
      return null;
    }
  }, [show]);

  const cancelOrder = useCallback(async (orderId: number): Promise<boolean> => {
    try {
      setCanceling(true);
      await apiRequest(`/sales/${orderId}/cancel`, { method: "POST" });
      await refresh();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error cancelando orden";
      if (mountedRef.current) show(msg, { type: "error" });
      return false;
    } finally {
      if (mountedRef.current) setCanceling(false);
    }
  }, [show, refresh]);

  return { orders, loading, canceling, refresh, loadOrderDetail, cancelOrder };
}
