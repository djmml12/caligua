/**
 * Formatea un monto en quetzales (GTQ) — locale es-GT.
 */
export const fmt = (n: number) =>
  new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
  }).format(n);

/**
 * Convierte string|number|undefined|null en number, devolviendo 0
 * si el valor no se puede parsear. Útil para precios que la API
 * a veces devuelve como string ("12.50").
 */
export const toNum = (v: number | string | undefined | null): number =>
  typeof v === "string" ? parseFloat(v) || 0 : (v ?? 0);
