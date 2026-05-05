import { useRef, type ReactNode } from "react";
import "./SwipeRow.css";

export interface SwipeAction {
  label:      string;
  icon?:      ReactNode;
  /** Background colour of the revealed button, e.g. var(--danger) */
  color:      string;
  textColor?: string;
  onAction:   () => void;
}

export interface SwipeRowProps {
  children:     ReactNode;
  actions?:     SwipeAction[];
  /** Width in px of each revealed action button. Default: 88 */
  actionWidth?: number;
  className?:   string;
}

/**
 * SwipeRow — horizontal swipe-left reveals action buttons.
 *
 * Uses Pointer Events (works with both touch and mouse).
 * Spring-back if the user doesn't drag past 40% of the action width.
 * When an action fires, the row snaps back to 0.
 */
export function SwipeRow({
  children,
  actions     = [],
  actionWidth = 88,
  className   = "",
}: SwipeRowProps) {
  const contentRef       = useRef<HTMLDivElement>(null);
  const startXRef        = useRef<number | null>(null);
  const currentDeltaRef  = useRef<number>(0);
  const totalActionWidth = actions.length * actionWidth;

  const setTranslate = (x: number, animated: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition  = animated
      ? `transform var(--dur-base) var(--ease)`
      : "none";
    el.style.transform = `translateX(${x}px)`;
  };

  const snapBack = () => setTranslate(0, true);
  const snapOpen = () => setTranslate(-totalActionWidth, true);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (totalActionWidth === 0) return;
    const target = e.target as Element;
    if (target.closest('button, input, textarea, select, [data-no-swipe]')) return;
    startXRef.current = e.clientX;
    currentDeltaRef.current = 0;
    setTranslate(0, false); // reset transition for live dragging
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    const rawDelta = e.clientX - startXRef.current;
    /* Only left swipe (negative). Add a small rubber-band past full open */
    const clamped = Math.max(-(totalActionWidth + 24), Math.min(0, rawDelta));
    currentDeltaRef.current = clamped;
    setTranslate(clamped, false);
  };

  const onPointerUp = () => {
    if (startXRef.current === null) return;
    startXRef.current = null;
    const threshold = totalActionWidth * 0.40;
    if (currentDeltaRef.current < -threshold) {
      snapOpen();
    } else {
      snapBack();
    }
  };

  const handleAction = (action: SwipeAction) => {
    snapBack();
    /* Small delay so the snap animation plays first */
    setTimeout(action.onAction, 180);
  };

  return (
    <div className={`uk-swipe-row ${className}`.trim()}>
      {/* Action buttons revealed behind the content */}
      {actions.length > 0 && (
        <div className="uk-swipe-actions" style={{ width: totalActionWidth }}>
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              className="uk-swipe-action-btn"
              style={{
                width:      actionWidth,
                background: action.color,
                color:      action.textColor ?? "#fff",
              }}
              onClick={() => handleAction(action)}
            >
              {action.icon && (
                <span className="uk-swipe-action-icon" aria-hidden="true">
                  {action.icon}
                </span>
              )}
              <span className="uk-swipe-action-label">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main content layer */}
      <div
        ref={contentRef}
        className="uk-swipe-content"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}
