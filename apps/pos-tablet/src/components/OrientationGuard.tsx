import { useEffect, useState, type ReactNode } from "react";
import "./OrientationGuard.css";

/* ── Detect portrait on touch devices only ─────────────────── */

const isPortrait = () => window.innerHeight > window.innerWidth;

/**
 * OrientationGuard — shows a "rotate your device" overlay whenever
 * the screen is in portrait orientation AND has touch (tablet/phone).
 * On desktop browsers it never activates.
 */
export default function OrientationGuard({ children }: { children: ReactNode }) {
  const [portrait, setPortrait] = useState(false);
  const isTouch = navigator.maxTouchPoints > 1;

  useEffect(() => {
    if (!isTouch) return;

    const check = () => setPortrait(isPortrait());
    check();

    window.addEventListener("resize", check);
    screen.orientation?.addEventListener("change", check);
    return () => {
      window.removeEventListener("resize", check);
      screen.orientation?.removeEventListener("change", check);
    };
  }, [isTouch]);

  return (
    <>
      {children}
      {portrait && isTouch && (
        <div className="og-overlay" role="alertdialog" aria-modal="true">
          <div className="og-card">
            <div className="og-phone" aria-hidden="true">
              <PhoneIcon />
            </div>
            <p className="og-title">Rotá el dispositivo</p>
            <p className="og-desc">
              Esta aplicación está optimizada para modo horizontal.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="56" height="56"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}
