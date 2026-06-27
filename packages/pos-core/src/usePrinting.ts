import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@pos/api-client";
import { useToast }   from "@pos/ui-kit";

export type KitchenTarget = "kitchen" | "bar";

export interface UsePrintingResult {
  printLoading:       boolean;
  /** POST /print/receipt — imprime ticket de venta. */
  printReceipt:       (saleId: number) => Promise<void>;
  /** POST /print/kitchen-ticket — envía a cocina y/o barra. */
  sendKitchenTicket:  (orderId: number, targets: KitchenTarget[]) => Promise<void>;
}

/**
 * Hook headless para impresión.
 * - Toasts incluidos para éxito/error.
 * - `printLoading` se reutiliza entre receipt y kitchen-ticket (un solo flag).
 */
export function usePrinting(): UsePrintingResult {
  const { show } = useToast();
  const mountedRef = useRef(true);

  const [printLoading, setPrintLoading] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const printReceipt = useCallback(async (saleId: number) => {
    setPrintLoading(true);
    try {
      await apiRequest("/print/receipt", {
        method:    "POST",
        body:      JSON.stringify({ sale_id: saleId }),
        timeoutMs: 10_000,
      });
      if (mountedRef.current) show("Ticket enviado a la impresora", { type: "success" });
    } catch {
      if (mountedRef.current) show("Impresora no disponible — revisa configuración", { type: "error" });
    } finally {
      if (mountedRef.current) setPrintLoading(false);
    }
  }, [show]);

  const sendKitchenTicket = useCallback(async (orderId: number, targets: KitchenTarget[]) => {
    setPrintLoading(true);
    try {
      const response = await apiRequest("/print/kitchen-ticket", {
        method:    "POST",
        body:      JSON.stringify({ saleId: orderId, targets }),
        timeoutMs: 5_000,
      }) as { success?: boolean; message?: string };

      if (response?.success) {
        const label = targets.length === 2  ? "Ticket enviado a cocina y barra"
                    : targets[0] === "kitchen" ? "Ticket enviado a cocina"
                    :                            "Ticket enviado a barra";
        if (mountedRef.current) show(label, { type: "success" });
      } else {
        throw new Error(response?.message || "Error desconocido");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo enviar el ticket";
      if (mountedRef.current) show(msg, { type: "error" });
    } finally {
      if (mountedRef.current) setPrintLoading(false);
    }
  }, [show]);

  return { printLoading, printReceipt, sendKitchenTicket };
}
