import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Button.css";

export type ButtonVariant = "primary" | "secondary" | "danger" | "success" | "ghost" | "icon";
export type ButtonSize    = "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:   ButtonVariant;
  size?:      ButtonSize;
  fullWidth?: boolean;
  loading?:   boolean;
  children:   ReactNode;
}

export function Button({
  variant   = "secondary",
  size      = "md",
  fullWidth = false,
  loading   = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const cls = [
    "uk-btn",
    `uk-btn--${variant}`,
    `uk-btn--${size}`,
    fullWidth ? "uk-btn--full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="uk-btn-spinner" aria-hidden="true" /> : children}
    </button>
  );
}
