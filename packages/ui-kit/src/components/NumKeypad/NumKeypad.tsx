import "./NumKeypad.css";

export interface NumKeypadProps {
  value:          string;
  onChange:       (value: string) => void;
  onConfirm?:     () => void;
  maxLength?:     number;
  /** Show a green confirm (✓) key instead of second backspace. Default: true */
  showConfirm?:   boolean;
  confirmLabel?:  string;
  /** Label shown above the display. Optional */
  displayLabel?:  string;
  /** Prefix shown in display (e.g. "Q"). Optional */
  prefix?:        string;
}

const BACKSPACE = "⌫";
const CLEAR     = "C";
const CONFIRM   = "✓";

export function NumKeypad({
  value,
  onChange,
  onConfirm,
  maxLength    = 8,
  showConfirm  = true,
  confirmLabel = CONFIRM,
  displayLabel,
  prefix,
}: NumKeypadProps) {
  const handleKey = (key: string) => {
    if (key === BACKSPACE) {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === CLEAR) {
      onChange("");
      return;
    }
    if (key === CONFIRM) {
      onConfirm?.();
      return;
    }
    if (value.length >= maxLength) return;
    onChange(value + key);
  };

  /* Row layout: 3×3 digits + bottom row */
  const digitRows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
  ];
  const bottomRow = [CLEAR, "0", showConfirm ? CONFIRM : BACKSPACE];

  return (
    <div className="uk-numpad">
      {displayLabel && (
        <span className="uk-numpad-label">{displayLabel}</span>
      )}
      <div className="uk-numpad-display">
        {prefix && <span className="uk-numpad-prefix">{prefix}</span>}
        <span className="uk-numpad-value">{value || "0"}</span>
      </div>

      <div className="uk-numpad-grid">
        {digitRows.flat().map((k) => (
          <button
            key={k}
            type="button"
            className="uk-numpad-key"
            onPointerDown={(e) => { e.preventDefault(); handleKey(k); }}
          >
            {k}
          </button>
        ))}

        {/* Backspace sits outside the main grid when showConfirm */}
        {showConfirm && (
          <button
            type="button"
            className="uk-numpad-key uk-numpad-key--action"
            onPointerDown={(e) => { e.preventDefault(); handleKey(BACKSPACE); }}
            aria-label="Borrar"
          >
            {BACKSPACE}
          </button>
        )}

        {bottomRow.map((k, i) => (
          <button
            key={`bottom-${i}`}
            type="button"
            className={[
              "uk-numpad-key",
              k === CONFIRM ? "uk-numpad-key--confirm" : "",
              k === CLEAR   ? "uk-numpad-key--action"  : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onPointerDown={(e) => { e.preventDefault(); handleKey(k); }}
            aria-label={k === CONFIRM ? "Confirmar" : k === CLEAR ? "Limpiar" : undefined}
          >
            {k === CONFIRM ? confirmLabel : k}
          </button>
        ))}
      </div>
    </div>
  );
}
