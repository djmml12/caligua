import "./printer-config.css";

export interface TicketConfig {
  width_mm:         string;
  margin_top_mm:    number;
  margin_bottom_mm: number;
  margin_left_mm:   number;
  margin_right_mm:  number;
  header_text:      string;
  footer_text:      string;
  logo_data_url:    string;
}

interface Props {
  config: TicketConfig;
}

const SAMPLE_ITEMS = [
  { name: "Burger clásica",  qty: 2, price: 45.00 },
  { name: "Papas fritas",    qty: 1, price: 18.50 },
  { name: "Refresco 500ml",  qty: 2, price: 12.00 },
];

const SAMPLE_TOTAL  = SAMPLE_ITEMS.reduce((s, i) => s + i.price * i.qty, 0);
const SAMPLE_TIP    = 13.25;
const SAMPLE_DATE   = "2026-04-20  14:32";

const fmt = (n: number) => `Q${n.toFixed(2)}`;

/* Converts mm margin to pixels using 4px/mm scale for the visual preview */
const mmToPx = (mm: number) => Math.max(0, mm * 4);

/* Mirrors the backend resolveConfig() in escpos-builder.js so the preview
 * shows the same usable width the printer will actually render. */
const DOTS_PER_MM         = 8;
const CHAR_WIDTH_DOTS     = 12;
const MIN_CHARS           = 16;
const PRINTABLE_DOTS_80MM = 576;
const PRINTABLE_DOTS_58MM = 384;

const computeContentWidth = (widthMm: 58 | 80, leftMm: number, rightMm: number) => {
  const totalDots = widthMm === 58 ? PRINTABLE_DOTS_58MM : PRINTABLE_DOTS_80MM;
  const leftDots  = Math.max(0, Math.round(leftMm  * DOTS_PER_MM));
  const rightDots = Math.max(0, Math.round(rightMm * DOTS_PER_MM));
  const printAreaDots = Math.max(MIN_CHARS * CHAR_WIDTH_DOTS, totalDots - leftDots - rightDots);
  return Math.max(MIN_CHARS, Math.floor(printAreaDots / CHAR_WIDTH_DOTS));
};

export default function TicketPreview({ config }: Props) {
  const is58        = String(config.width_mm) === "58";
  const widthMm     = is58 ? 58 : 80;
  const charsTotal  = is58 ? 32 : 48;
  const contentChars = computeContentWidth(
    widthMm,
    Number(config.margin_left_mm)  || 0,
    Number(config.margin_right_mm) || 0,
  );

  const paddingTop    = mmToPx(config.margin_top_mm);
  const paddingBottom = mmToPx(config.margin_bottom_mm);
  const paddingLeft   = mmToPx(config.margin_left_mm);
  const paddingRight  = mmToPx(config.margin_right_mm);

  const dividerStr = "-".repeat(contentChars);

  const headerLines = config.header_text.split("\n").filter(l => l.trim());
  const footerLines = config.footer_text.split("\n").filter(l => l.trim());

  return (
    <div className="pc-preview-wrap">
      <div className="pc-preview-label">Vista previa</div>

      <div
        className="pc-ticket"
        style={{ borderLeft: `3px solid ${is58 ? "var(--primary)" : "var(--text-3)"}` }}
      >
        <div
          className="pc-ticket-inner"
          style={{
            paddingTop,
            paddingBottom,
            paddingLeft,
            paddingRight,
          }}
        >
          {/* Logo */}
          {config.logo_data_url && (
            <img
              src={config.logo_data_url}
              alt="Logo"
              className="pc-ticket-logo"
            />
          )}

          {/* Header text */}
          {headerLines.length > 0 && (
            <div className="pc-ticket-center" style={{ marginBottom: 4 }}>
              {headerLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}

          <hr className="pc-ticket-divider" />

          {/* Receipt title */}
          <div className="pc-ticket-center pc-ticket-bold">RECIBO DE VENTA</div>
          <div className="pc-ticket-center pc-ticket-muted">{SAMPLE_DATE}</div>
          <div className="pc-ticket-center pc-ticket-muted">#1042</div>

          <hr className="pc-ticket-divider" />

          {/* Items */}
          {SAMPLE_ITEMS.map((item, i) => (
            <div key={i} className="pc-ticket-row">
              <span>{item.qty}x {item.name}</span>
              <span>{fmt(item.price * item.qty)}</span>
            </div>
          ))}

          <hr className="pc-ticket-divider" />

          {/* Totals */}
          <div className="pc-ticket-row">
            <span>Subtotal</span>
            <span>{fmt(SAMPLE_TOTAL)}</span>
          </div>
          <div className="pc-ticket-row">
            <span>Propina (10%)</span>
            <span>{fmt(SAMPLE_TIP)}</span>
          </div>
          <div className="pc-ticket-total-row">
            <span>TOTAL</span>
            <span>{fmt(SAMPLE_TOTAL + SAMPLE_TIP)}</span>
          </div>

          <hr className="pc-ticket-divider" />

          {/* Footer text */}
          {footerLines.length > 0 && (
            <div className="pc-ticket-center" style={{ marginTop: 4 }}>
              {footerLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}

          {/* Divider hint */}
          <div className="pc-ticket-center pc-ticket-muted" style={{ marginTop: 6, fontSize: 10 }}>
            {dividerStr}
          </div>
        </div>
      </div>

      <div className="pc-cut-line">corte</div>

      <div style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center", maxWidth: 220 }}>
        {widthMm}mm · ancho útil {contentChars}/{charsTotal} caracteres
      </div>
    </div>
  );
}
