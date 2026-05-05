import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import "./Input.css";

export type InputSize = "md" | "lg";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label:          string;
  error?:         string;
  size?:          InputSize;
  rightElement?:  ReactNode;
  className?:     string;
}

export function Input({
  label,
  error,
  size         = "lg",
  rightElement,
  className    = "",
  value,
  ...rest
}: InputProps) {
  const id       = useId();
  const filled   = value !== undefined && value !== "";
  const hasError = Boolean(error);

  const wrapCls = [
    "uk-input-field",
    `uk-input-field--${size}`,
    hasError ? "uk-input-field--error"  : "",
    filled   ? "uk-input-field--filled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`uk-input-wrap ${className}`.trim()}>
      <div className={wrapCls}>
        <input
          id={id}
          className="uk-input"
          value={value}
          placeholder=" "
          {...rest}
        />
        <label className="uk-input-label" htmlFor={id}>
          {label}
        </label>
        {rightElement && (
          <div className="uk-input-right">{rightElement}</div>
        )}
      </div>
      {hasError && (
        <span className="uk-input-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
