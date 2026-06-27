import type { HTMLAttributes, ReactNode } from "react";
import "./Badge.css";

export type BadgeVariant = "success" | "danger" | "warning" | "info" | "neutral" | "dark";
export type BadgeSize    = "sm" | "md";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children:  ReactNode;
  variant?:  BadgeVariant;
  size?:     BadgeSize;
  /** Dot-only indicator (no text) */
  dot?:      boolean;
}

export function Badge({
  children,
  variant  = "neutral",
  size     = "md",
  dot      = false,
  className = "",
  ...rest
}: BadgeProps) {
  const cls = [
    "uk-badge",
    `uk-badge--${variant}`,
    `uk-badge--${size}`,
    dot ? "uk-badge--dot" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={cls} {...rest}>
      {!dot && children}
    </span>
  );
}
