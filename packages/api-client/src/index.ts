/**
 * API base URL — resolves dynamically so clientes en la red local
 * siempre alcanzan el backend desde el mismo host que sirvió el frontend.
 *
 * Prioridad:
 *   1. VITE_API_URL env var (para builds de producción)
 *   2. Same-origin para deploys web (`/api`)
 *      - nginx proxea `/api` en producción
 *      - Vite proxea `/api` en desarrollo
 *   3. Mismo hostname que la página, puerto 3000 (solo para Electron `file://`)
 */
const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

const _hostname = window.location.hostname || "127.0.0.1";
const isFileProtocol = window.location.protocol === "file:";

const API_BASE = configuredApiUrl
  ? configuredApiUrl.replace(/\/+$/, "")
  : isFileProtocol
    ? `http://${_hostname}:3000`
    : "";

/** URL del endpoint SSE de stock (no requiere autenticación). */
export const STOCK_EVENTS_URL = `${API_BASE}/api/stock-events`;

export const apiRequest = async (endpoint: string, options: RequestInit & { timeoutMs?: number } = {}) => {
  const token      = localStorage.getItem("token");
  const controller = new AbortController();
  const timeoutMs  = options.timeoutMs ?? 30_000;
  const timeoutId  = window.setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}/api${endpoint}`, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : null;

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem("token");
      }
      throw new Error((data as { message?: string })?.message ?? "API error");
    }

    return data as unknown;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Tiempo de espera agotado con el backend");
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
};
