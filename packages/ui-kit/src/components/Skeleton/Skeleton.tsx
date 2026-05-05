import type { CSSProperties } from "react";
import "./Skeleton.css";

export type SkeletonVariant = "rect" | "circle" | "text";

export interface SkeletonProps {
  variant?:   SkeletonVariant;
  width?:     number | string;
  height?:    number | string;
  /** Number of text lines to render. Only used when variant="text". */
  lines?:     number;
  className?: string;
  style?:     CSSProperties;
}

/**
 * Skeleton — animated shimmer placeholder for loading states.
 *
 * - `rect`   — rounded rectangle (default)
 * - `circle` — circular avatar/icon placeholder
 * - `text`   — one or more stacked text lines
 */
export function Skeleton({
  variant   = "rect",
  width,
  height,
  lines     = 1,
  className = "",
  style,
}: SkeletonProps) {
  if (variant === "text") {
    return (
      <div className={`uk-skel-text-group ${className}`.trim()} style={style}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="uk-skel uk-skel--text"
            /* Last line is shorter to look natural */
            style={i === lines - 1 && lines > 1 ? { width: "65%" } : undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`uk-skel uk-skel--${variant} ${className}`.trim()}
      style={{ width, height, ...style }}
    />
  );
}
