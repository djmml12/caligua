import "./pos-placeholder.css";

export default function PosPlaceholder() {
  return (
    <div className="pp-shell">
      <div className="pp-icon" aria-hidden="true">🍖</div>
      <p className="pp-title">Catálogo</p>
      <p className="pp-sub">
        Próximamente: explorar productos y agregar al ticket.
      </p>
    </div>
  );
}
