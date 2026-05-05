import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./BottomSheet.css";

export type BottomSheetHeight = "auto" | "half" | "tall" | "full";

export interface BottomSheetProps {
  open:               boolean;
  onClose:            () => void;
  title?:             string;
  children:           ReactNode;
  height?:            BottomSheetHeight;
  /** Tap backdrop to close. Default: true */
  closeOnBackdrop?:   boolean;
  /** Allow drag-down to close. Default: true */
  draggable?:         boolean;
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  height          = "auto",
  closeOnBackdrop = true,
  draggable       = true,
}: BottomSheetProps) {
  const sheetRef    = useRef<HTMLDivElement>(null);
  const startYRef   = useRef<number | null>(null);
  const currentYRef = useRef<number>(0);

  /* ── Scroll lock ──────────────────────── */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  /* ── Scroll focused input into view when keyboard opens ── */
  useEffect(() => {
    if (!open) return;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && sheetRef.current?.contains(t)) {
        setTimeout(() => t.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open]);

  /* ── Drag to dismiss ──────────────────── */
  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable) return;
    startYRef.current = e.clientY;
    currentYRef.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable || startYRef.current === null) return;
    const delta = e.clientY - startYRef.current;
    if (delta <= 0) return; // don't allow dragging up
    currentYRef.current = delta;
    if (sheetRef.current) {
      sheetRef.current.style.transition = "none";
      sheetRef.current.style.transform  = `translateY(${delta}px)`;
    }
  };

  const onDragEnd = () => {
    if (!draggable) return;
    startYRef.current = null;
    if (currentYRef.current > 110) {
      onClose();
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = "";
        sheetRef.current.style.transform  = "";
      }
    }
    currentYRef.current = 0;
  };

  if (!open) return null;

  return createPortal(
    <div
      className="uk-bs-backdrop"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Stop propagation so clicking inside the sheet doesn't close it */}
      <div
        ref={sheetRef}
        className={`uk-bs uk-bs--${height}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle area */}
        <div
          className="uk-bs-handle-area"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="uk-bs-handle" />
        </div>

        {title && (
          <div className="uk-bs-header">
            <span className="uk-bs-title">{title}</span>
          </div>
        )}

        <div className="uk-bs-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
