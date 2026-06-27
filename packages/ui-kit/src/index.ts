/* ============================================================
   @pos/ui-kit — Public API
   ============================================================ */

/* ── Components ─────────────────────────────────────────── */
export { Button }        from "./components/Button";
export { Card }          from "./components/Card";
export { Input }         from "./components/Input";
export { BottomSheet }   from "./components/BottomSheet";
export { NumKeypad }     from "./components/NumKeypad";
export { TouchKeyboard, DEFAULT_ROWS } from "./components/TouchKeyboard";
export { SwipeRow }      from "./components/SwipeRow";
export { FAB }           from "./components/FAB";
export { ToastProvider, useToast } from "./components/Toast";
export { Badge }         from "./components/Badge";
export { Skeleton }      from "./components/Skeleton";
export { Spinner }       from "./components/Spinner";

/* ── Types ──────────────────────────────────────────────── */
export type { ButtonProps, ButtonVariant, ButtonSize }           from "./components/Button";
export type { CardProps, CardPadding }                           from "./components/Card";
export type { InputProps, InputSize }                            from "./components/Input";
export type { BottomSheetProps, BottomSheetHeight }              from "./components/BottomSheet";
export type { NumKeypadProps }                                   from "./components/NumKeypad";
export type { TouchKeyboardProps }                               from "./components/TouchKeyboard";
export type { SwipeRowProps, SwipeAction }                       from "./components/SwipeRow";
export type { FABProps, FABPosition }                            from "./components/FAB";
export type { ToastContextValue, ToastType, ShowToastOptions, ToastAction } from "./components/Toast";
export type { BadgeProps, BadgeVariant, BadgeSize }              from "./components/Badge";
export type { SkeletonProps, SkeletonVariant }                   from "./components/Skeleton";
export type { SpinnerProps, SpinnerSize }                        from "./components/Spinner";
