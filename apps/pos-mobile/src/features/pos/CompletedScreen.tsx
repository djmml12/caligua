import { fmt } from "@pos/pos-core";
import { Button, Spinner } from "@pos/ui-kit";
import "./completed-screen.css";

interface CompletedScreenProps {
  total:            number;
  saleId:           number | null;
  printLoading:     boolean;
  onPrintReceipt:   () => void;
  onDismiss:        () => void;
}

function PrinterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

export default function CompletedScreen({
  total,
  saleId,
  printLoading,
  onPrintReceipt,
  onDismiss,
}: CompletedScreenProps) {
  const canPrint = saleId != null && !printLoading;

  return (
    <div className="cs-overlay">
      <div className="cs-icon">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className="cs-check">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <p className="cs-title">¡Cobrado!</p>
      <p className="cs-total">{fmt(total)}</p>

      {/* ── Acción de impresión ───────────────── */}
      <div className="cs-print-row">
        <button
          className="cs-print-btn"
          onClick={onPrintReceipt}
          disabled={!canPrint}
          aria-label="Imprimir recibo"
        >
          {printLoading ? (
            <Spinner size="sm" />
          ) : (
            <PrinterIcon />
          )}
          Recibo
        </button>
      </div>

      <div className="cs-btn">
        <Button variant="secondary" size="lg" fullWidth onClick={onDismiss}>
          Nuevo ticket
        </Button>
      </div>
    </div>
  );
}
