import type { HTMLAttributes, ReactNode } from "react";
import "./Card.css";

export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children:    ReactNode;
  padding?:    CardPadding;
  interactive?: boolean;
  elevated?:   boolean;
  className?:  string;
}

export function Card({
  children,
  padding     = "md",
  interactive = false,
  elevated    = false,
  className   = "",
  ...rest
}: CardProps) {
  const cls = [
    "uk-card",
    padding !== "none" ? `uk-card--pad-${padding}` : "",
    interactive ? "uk-card--interactive" : "",
    elevated    ? "uk-card--elevated"    : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}
