import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "./Toast.css";

/* ── Types ────────────────────────────────────────────────── */

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label:   string;
  onClick: () => void;
}

export interface ShowToastOptions {
  type?:     ToastType;
  action?:   ToastAction;
  /** Auto-dismiss delay in ms. Default: 3000 */
  duration?: number;
}

export interface ToastContextValue {
  show: (message: string, options?: ShowToastOptions) => void;
}

/* ── Internal item type ───────────────────────────────────── */

interface ToastItem {
  id:       number;
  message:  string;
  type:     ToastType;
  action?:  ToastAction;
  duration: number;
}

/* ── Context ──────────────────────────────────────────────── */

const ToastCtx = createContext<ToastContextValue | null>(null);

/* ── Provider ─────────────────────────────────────────────── */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const show = useCallback((message: string, opts?: ShowToastOptions) => {
    const id   = ++counterRef.current;
    const duration = opts?.duration ?? 3000;

    setToasts((prev) => [
      ...prev,
      { id, message, type: opts?.type ?? "info", action: opts?.action, duration },
    ]);

    /* Auto-remove after duration + exit-animation time (300 ms) */
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration + 300);
  }, []);

  const dismiss = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="uk-toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <ToastEntry
            key={toast.id}
            toast={toast}
            onDismiss={() => dismiss(toast.id)}
          />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ── Single toast entry ───────────────────────────────────── */

function ToastEntry({
  toast,
  onDismiss,
}: {
  toast:     ToastItem;
  onDismiss: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  /* Animate the progress bar from 100% → 0% */
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    /* Use two rAFs to ensure the element is painted at 100% first */
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (bar) {
          bar.style.transitionDuration = `${toast.duration}ms`;
          bar.style.width = "0%";
        }
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [toast.duration]);

  return (
    <div
      className={`uk-toast uk-toast--${toast.type}`}
      role="alert"
    >
      <span className="uk-toast-message">{toast.message}</span>

      {toast.action && (
        <button
          type="button"
          className="uk-toast-action-btn"
          onClick={() => {
            toast.action!.onClick();
            onDismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}

      <div className="uk-toast-bar" ref={barRef} />
    </div>
  );
}

/* ── Hook ─────────────────────────────────────────────────── */

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
