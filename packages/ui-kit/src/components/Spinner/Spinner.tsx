import type { CSSProperties } from "react";
import "./Spinner.css";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps {
  size?:      SpinnerSize;
  /** Override the spinner colour */
  color?:     string;
  className?: string;
  style?:     CSSProperties;
}

export function Spinner({
  size      = "md",
  color,
  className = "",
  style,
}: SpinnerProps) {
  return (
    <div
      className={`uk-spinner uk-spinner--${size} ${className}`.trim()}
      style={color ? { "--uk-spinner-color": color, ...style } as CSSProperties : style}
      role="status"
      aria-label="Cargando"
    />
  );
}
