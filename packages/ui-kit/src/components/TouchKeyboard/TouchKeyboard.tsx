import { useEffect, useLayoutEffect, useRef } from "react";
import "./TouchKeyboard.css";

/* ── Keyboard layout ──────────────────────
   Layout standard en-US QWERTY + ñ/Ñ row.
   The parent can override `rows` for locale.
   ────────────────────────────────────────── */
export const DEFAULT_ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ñ"],
  ["z", "x", "c", "v", "b", "n", "m", "@", "."],
];

export interface TouchKeyboardProps {
  open:       boolean;
  onClose?:   () => void;
  /** Custom key rows. Default: Spanish QWERTY layout */
  rows?:      string[][];
}

/**
 * iOS-style on-screen keyboard anchored at the bottom of the viewport.
 * It listens for `focusin` events globally and injects characters
 * into whichever input/textarea is currently focused.
 *
 * Uses `onPointerDown` + `e.preventDefault()` so the keyboard does NOT
 * steal focus from the current input when a key is tapped.
 */
export function TouchKeyboard({
  open,
  onClose,
  rows = DEFAULT_ROWS,
}: TouchKeyboardProps) {
  const targetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const kbRef     = useRef<HTMLDivElement>(null);

  /* Broadcast keyboard height as CSS variable so BottomSheet can shrink */
  useLayoutEffect(() => {
    const height = kbRef.current?.offsetHeight ?? 0;
    document.documentElement.style.setProperty(
      "--keyboard-height",
      open ? `${height}px` : "0px"
    );
    return () => {
      document.documentElement.style.setProperty("--keyboard-height", "0px");
    };
  }, [open]);

  /* Track the active input globally */
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (
        (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) &&
        !t.readOnly &&
        !t.disabled
      ) {
        targetRef.current = t;
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  /* ── Text injection helpers ─────────────── */

  /* React controlled inputs ignore direct el.value assignments.
     Using the native prototype setter forces React's onChange to fire. */
  const setReactValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    nativeSetter?.call(el, value);
  };

  /* setSelectionRange throws InvalidStateError on type="number" / "email" / etc.
     We still want the input event to fire, so swallow the error. */
  const safeSetSelection = (el: HTMLInputElement | HTMLTextAreaElement, start: number, end: number) => {
    try { el.setSelectionRange(start, end); } catch { /* unsupported type */ }
  };

  const insertText = (char: string) => {
    const el = targetRef.current;
    if (!el || el.readOnly || el.disabled) return;

    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;

    setReactValue(el, `${el.value.slice(0, start)}${char}${el.value.slice(end)}`);
    safeSetSelection(el, start + char.length, start + char.length);
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const doBackspace = () => {
    const el = targetRef.current;
    if (!el || el.readOnly || el.disabled) return;

    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;

    if (start !== end) {
      setReactValue(el, `${el.value.slice(0, start)}${el.value.slice(end)}`);
      safeSetSelection(el, start, start);
    } else if (start > 0) {
      setReactValue(el, `${el.value.slice(0, start - 1)}${el.value.slice(end)}`);
      safeSetSelection(el, start - 1, start - 1);
    } else {
      return;
    }

    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const doSpace = () => insertText(" ");

  const handleKey = (key: string) => {
    insertText(key);
  };

  return (
    <div
      ref={kbRef}
      className={`uk-kb${open ? " uk-kb--open" : ""}`}
      aria-hidden={!open}
      /* Prevent any tap inside the keyboard from blurring the input */
      onPointerDown={(e) => e.preventDefault()}
    >
      {/* Handle + close row */}
      <div className="uk-kb-topbar">
        <div className="uk-kb-handle" />
        {onClose && (
          <button
            type="button"
            className="uk-kb-close-btn"
            onPointerDown={(e) => {
              e.preventDefault();
              onClose();
            }}
            aria-label="Cerrar teclado"
          >
            ✕
          </button>
        )}
      </div>

      {/* Character rows */}
      <div className="uk-kb-rows">
        {rows.map((row, ri) => (
          <div key={ri} className="uk-kb-row">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                className="uk-kb-key"
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleKey(key);
                }}
              >
                {key}
              </button>
            ))}
          </div>
        ))}

        {/* Action row: ⌫  Espacio  ⏎ */}
        <div className="uk-kb-row uk-kb-row--actions">
          <button
            type="button"
            className="uk-kb-key uk-kb-key--action"
            onPointerDown={(e) => { e.preventDefault(); doBackspace(); }}
            aria-label="Borrar"
          >
            ⌫
          </button>
          <button
            type="button"
            className="uk-kb-key uk-kb-key--space"
            onPointerDown={(e) => { e.preventDefault(); doSpace(); }}
            aria-label="Espacio"
          >
            espacio
          </button>
          <button
            type="button"
            className="uk-kb-key uk-kb-key--action"
            onPointerDown={(e) => {
              e.preventDefault();
              /* Simulate Enter on the focused element */
              targetRef.current?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
            }}
            aria-label="Enter"
          >
            ⏎
          </button>
        </div>
      </div>
    </div>
  );
}
