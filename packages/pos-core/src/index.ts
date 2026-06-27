/* ── Format helpers ───────────────────────────────────────── */
export { fmt, toNum } from "./format";

/* ── Hooks (headless) ─────────────────────────────────────── */
export { useCatalog }    from "./useCatalog";
export { useTicket }     from "./useTicket";
export { useMultiTicket } from "./useMultiTicket";
export { useOrders }     from "./useOrders";
export { useCheckout }   from "./useCheckout";
export { usePrinting }        from "./usePrinting";
export type { KitchenTarget } from "./usePrinting";

/* ── Multi-ticket types ───────────────────────────────────── */
export type { TicketSlot } from "./useMultiTicket";

/* ── Types re-exportados para conveniencia ────────────────── */
export type { Product, Category, CartItem, SavedOrder } from "@pos/types";
