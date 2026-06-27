import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./FAB.css";

export type FABPosition = "bottom-right" | "bottom-left" | "bottom-center";

export interface FABProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon:        ReactNode;
  label?:      string;
  position?:   FABPosition;
  /** Offset from the edge in px. Default: 24 */
  offset?:     number;
}

/**
 * FAB — Floating Action Button.
 * Fixed position, dark charcoal background, pill shape.
 * Expands to show label when `label` is provided.
 */
export function FAB({
  icon,
  label,
  position = "bottom-right",
  offset   = 24,
  className = "",
  style,
  ...rest
}: FABProps) {
  const cls = [
    "uk-fab",
    `uk-fab--${position}`,
    label ? "uk-fab--labeled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inlineStyle = {
    "--fab-offset": `${offset}px`,
    ...style,
  } as React.CSSProperties;

  return (
    <button type="button" className={cls} style={inlineStyle} {...rest}>
      <span className="uk-fab-icon" aria-hidden="true">{icon}</span>
      {label && <span className="uk-fab-label">{label}</span>}
    </button>
  );
}
