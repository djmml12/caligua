import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./reservations.css";

/* ── Types ───────────────────────────────────────────────────── */

interface Product {
  id:          number;
  name:        string;
  price:       number;
  category_id: number;
  is_active:   number;
}

interface Category {
  id:       number;
  name:     string;
  children: Category[];
}

interface TicketItem {
  product_id: number;
  name:       string;
  price:      number;
  quantity:   number;
  subtotal:   number;
}

interface Reservation {
  id:            number;
  customer_name: string;
  phone:         string | null;
  date:          string;
  time:          string | null;
  items:         TicketItem[];
  total:         number;
  notes:         string | null;
  status:        string;
  created_at:    string;
}

/* ── Helpers ─────────────────────────────────────────────────── */

const fmtQ = (n: number) => `Q${Number(n || 0).toFixed(2)}`;

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmtDateDisplay = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

/* ── PDF generator ───────────────────────────────────────────── */

function generateReservationPdf(reservation: Partial<Reservation> & { items: TicketItem[]; total: number }) {
  const doc = new jsPDF({ format: "a5", orientation: "portrait" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(180, 50, 10);
  doc.text("RESERVA", W / 2, 16, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);

  let y = 26;
  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, 12, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 48, y);
    y += 7;
  };

  row("Cliente:", reservation.customer_name ?? "");
  if (reservation.phone) row("Teléfono:", reservation.phone);
  row("Fecha:",   reservation.date ? fmtDateDisplay(reservation.date) : "");
  if (reservation.time) row("Hora:", String(reservation.time).slice(0, 5));

  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(12, y, W - 12, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Producto", "Cant.", "Precio", "Subtotal"]],
    body: (reservation.items ?? []).map((i) => [
      i.name,
      String(i.quantity),
      fmtQ(i.price),
      fmtQ(i.subtotal),
    ]),
    styles:       { fontSize: 9, cellPadding: 3 },
    headStyles:   { fillColor: [180, 50, 10], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: "auto" }, 1: { halign: "center", cellWidth: 16 }, 2: { halign: "right", cellWidth: 24 }, 3: { halign: "right", cellWidth: 24 } },
    margin:       { left: 12, right: 12 },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(180, 50, 10);
  doc.text(`TOTAL: ${fmtQ(reservation.total)}`, W - 12, finalY, { align: "right" });

  if (reservation.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Nota: ${reservation.notes}`, 12, finalY + 10);
  }

  const name = `reserva_${reservation.customer_name?.replace(/\s+/g, "_") ?? "cliente"}_${reservation.date ?? todayIso()}.pdf`;
  doc.save(name);
}

/* ── Main component ──────────────────────────────────────────── */

export default function ReservationsManager() {
  /* ── Catalog state ── */
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [products,     setProducts]     = useState<Product[]>([]);
  const [activeCatId,  setActiveCatId]  = useState<number | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  /* ── Form state ── */
  const [customerName, setCustomerName] = useState("");
  const [phone,        setPhone]        = useState("");
  const [date,         setDate]         = useState(todayIso());
  const [time,         setTime]         = useState("");
  const [notes,        setNotes]        = useState("");
  const [items,        setItems]        = useState<TicketItem[]>([]);

  /* ── List state ── */
  const [filterDate,   setFilterDate]   = useState(todayIso());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [listLoading,  setListLoading]  = useState(false);

  /* ── Action state ── */
  const [saving,        setSaving]        = useState(false);
  const [savingPrint,   setSavingPrint]   = useState(false);
  const [printing,      setPrinting]      = useState<number | null>(null);
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  /* ── Panel toggle ── */
  const [panel, setPanel] = useState<"new" | "list">("new");

  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => { if (mountedRef.current) setToast(null); }, 3200);
  };

  /* ── Load catalog ── */
  useEffect(() => {
    const load = async () => {
      try {
        const [cRows, pRows] = await Promise.all([
          apiRequest("/categories") as Promise<(Category & { parent_id: number | null })[]>,
          apiRequest("/products")   as Promise<Product[]>,
        ]);
        if (!mountedRef.current) return;
        const cats = (cRows ?? []).filter((c) => !c.parent_id);
        setCategories(cats);
        setProducts((pRows ?? []).filter((p) => p.is_active));
        if (cats.length) setActiveCatId(cats[0].id);
      } finally {
        if (mountedRef.current) setCatalogLoading(false);
      }
    };
    void load();
  }, []);

  /* ── Load reservations list ── */
  const loadReservations = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await apiRequest(`/reservations?date=${filterDate}`) as { success: boolean; data: Reservation[] };
      if (mountedRef.current) setReservations(res.data ?? []);
    } finally {
      if (mountedRef.current) setListLoading(false);
    }
  }, [filterDate]);

  useEffect(() => { if (panel === "list") void loadReservations(); }, [panel, loadReservations]);

  /* ── Cart helpers ── */
  const visibleProducts = activeCatId
    ? products.filter((p) => p.category_id === activeCatId)
    : products;

  const addItem = (product: Product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id
            ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.price }
            : i
        );
      }
      return [...prev, { product_id: product.id, name: product.name, price: product.price, quantity: 1, subtotal: product.price }];
    });
  };

  const changeQty = (productId: number, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) =>
          i.product_id === productId
            ? { ...i, quantity: i.quantity + delta, subtotal: (i.quantity + delta) * i.price }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const total = items.reduce((s, i) => s + i.subtotal, 0);

  /* ── Save reservation (shared) ── */
  const saveReservation = async () => {
    if (!customerName.trim()) { showToast("Ingresa el nombre del cliente", false); return null; }
    if (!date)                 { showToast("Selecciona una fecha",          false); return null; }
    const res = await apiRequest("/reservations", {
      method: "POST",
      body: JSON.stringify({ customer_name: customerName.trim(), phone: phone || null, date, time: time || null, items, notes: notes || null }),
    }) as { success: boolean; data: Reservation };
    if (!res.success) throw new Error("Error guardando");
    return res.data;
  };

  const resetForm = () => {
    setCustomerName(""); setPhone(""); setDate(todayIso()); setTime(""); setNotes(""); setItems([]);
  };

  /* ── Guardar + PDF ── */
  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveReservation();
      if (!saved) return;
      showToast("Reserva guardada");
      generateReservationPdf({ ...saved, items, total });
      resetForm();
    } catch (e: unknown) {
      showToast((e as Error).message || "Error al guardar", false);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  /* ── Guardar + imprimir ticket térmico ── */
  const handleSaveAndPrint = async () => {
    setSavingPrint(true);
    try {
      const saved = await saveReservation();
      if (!saved) return;
      showToast("Reserva guardada — enviando a impresora…");
      const pRes = await apiRequest("/print/reservation", {
        method: "POST",
        body: JSON.stringify({ reservation_id: saved.id }),
      }) as { success: boolean; message?: string };
      if (pRes.success) { showToast("Ticket impreso"); }
      else              { showToast(pRes.message ?? "Error al imprimir", false); }
      resetForm();
    } catch (e: unknown) {
      showToast((e as Error).message || "Error", false);
    } finally {
      if (mountedRef.current) setSavingPrint(false);
    }
  };

  /* ── Print thermal (desde lista) ── */
  const handlePrint = async (id: number) => {
    setPrinting(id);
    try {
      const res = await apiRequest("/print/reservation", {
        method: "POST",
        body: JSON.stringify({ reservation_id: id }),
      }) as { success: boolean; message?: string };
      if (res.success) { showToast("Ticket enviado a impresora"); }
      else             { showToast(res.message ?? "Error al imprimir", false); }
    } catch (e: unknown) {
      showToast((e as Error).message || "Error al imprimir", false);
    } finally {
      if (mountedRef.current) setPrinting(null);
    }
  };

  /* ── Delete ── */
  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar esta reserva?")) return;
    try {
      await apiRequest(`/reservations/${id}`, { method: "DELETE" });
      setReservations((prev) => prev.filter((r) => r.id !== id));
      showToast("Reserva eliminada");
    } catch {
      showToast("Error al eliminar", false);
    }
  };

  /* ── Render ── */
  return (
    <div className="rsv-root">

      {/* Toast */}
      {toast && (
        <div className={`rsv-toast${toast.ok ? "" : " rsv-toast--err"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="av-header">
        <div className="av-title">Reservas</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`rsv-tab${panel === "new"  ? " rsv-tab--active" : ""}`} onClick={() => setPanel("new")}>Nueva reserva</button>
          <button className={`rsv-tab${panel === "list" ? " rsv-tab--active" : ""}`} onClick={() => setPanel("list")}>Ver reservas</button>
        </div>
      </div>

      {/* ── PANEL: Nueva reserva ── */}
      {panel === "new" && (
        <div className="rsv-new-layout">

          {/* Left: form + catalog */}
          <div className="rsv-left">

            {/* Customer form */}
            <div className="rsv-section">
              <div className="rsv-section-title">Datos del cliente</div>
              <div className="rsv-form-grid">
                <div className="al-field">
                  <label className="al-field-label">Nombre *</label>
                  <input className="rsv-input" placeholder="Nombre completo" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </div>
                <div className="al-field">
                  <label className="al-field-label">Teléfono</label>
                  <input className="rsv-input" placeholder="Ej. 5555-1234" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="al-field">
                  <label className="al-field-label">Fecha *</label>
                  <input className="rsv-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="al-field">
                  <label className="al-field-label">Hora</label>
                  <input className="rsv-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Catalog */}
            <div className="rsv-section rsv-catalog-section">
              <div className="rsv-section-title">Agregar productos</div>
              {catalogLoading ? (
                <div className="rsv-catalog-loading"><Spinner /></div>
              ) : (
                <>
                  <div className="rsv-cat-chips">
                    <button className={`inv-cat-chip${activeCatId === null ? " inv-cat-chip--active" : ""}`} onClick={() => setActiveCatId(null)}>Todos</button>
                    {categories.map((c) => (
                      <button key={c.id} className={`inv-cat-chip${activeCatId === c.id ? " inv-cat-chip--active" : ""}`} onClick={() => setActiveCatId(c.id)}>{c.name}</button>
                    ))}
                  </div>
                  <div className="rsv-product-grid">
                    {visibleProducts.map((p) => (
                      <button key={p.id} className="rsv-product-btn" onClick={() => addItem(p)}>
                        <span className="rsv-product-name">{p.name}</span>
                        <span className="rsv-product-price">{fmtQ(p.price)}</span>
                      </button>
                    ))}
                    {visibleProducts.length === 0 && (
                      <div className="rsv-empty-cat">Sin productos en esta categoría</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: live ticket */}
          <div className="rsv-right">
            <div className="rsv-ticket">
              <div className="rsv-ticket-header">
                <div className="rsv-ticket-title">Ticket de reserva</div>
                {(customerName || date) && (
                  <div className="rsv-ticket-meta">
                    {customerName && <span>{customerName}</span>}
                    {date && <span>{fmtDateDisplay(date)}{time ? ` — ${time.slice(0,5)}` : ""}</span>}
                  </div>
                )}
              </div>

              <div className="rsv-ticket-items">
                {items.length === 0 ? (
                  <div className="rsv-ticket-empty">Agrega productos desde el catálogo</div>
                ) : (
                  items.map((item) => (
                    <div key={item.product_id} className="rsv-ticket-item">
                      <div className="rsv-ticket-item-name">{item.name}</div>
                      <div className="rsv-ticket-item-controls">
                        <button className="rsv-qty-btn" onClick={() => changeQty(item.product_id, -1)}>−</button>
                        <span className="rsv-qty-val">{item.quantity}</span>
                        <button className="rsv-qty-btn" onClick={() => changeQty(item.product_id, +1)}>+</button>
                      </div>
                      <div className="rsv-ticket-item-sub">{fmtQ(item.subtotal)}</div>
                    </div>
                  ))
                )}
              </div>

              <div className="rsv-ticket-notes">
                <label className="rsv-ticket-notes-label">Notas de la reserva</label>
                <textarea
                  className="rsv-ticket-notes-input"
                  placeholder="Indicaciones especiales, alergias, decoración…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="rsv-ticket-footer">
                <div className="rsv-ticket-count">{items.reduce((s, i) => s + i.quantity, 0)} productos</div>
                <div className="rsv-ticket-total">TOTAL: {fmtQ(total)}</div>
              </div>

              <div className="rsv-ticket-actions">
                <Button variant="primary" size="md" fullWidth onClick={handleSave} disabled={saving || savingPrint}>
                  {saving ? <Spinner /> : <><PdfIcon /> Guardar y descargar PDF</>}
                </Button>
                <Button variant="secondary" size="md" fullWidth onClick={handleSaveAndPrint} disabled={saving || savingPrint}>
                  {savingPrint ? <Spinner /> : <><PrinterIcon /> Guardar e imprimir ticket</>}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PANEL: Ver reservas ── */}
      {panel === "list" && (
        <div className="rsv-list-layout">
          <div className="rsv-list-filters">
            <label className="al-field-label" style={{ alignSelf: "center" }}>Fecha</label>
            <input className="rsv-input rsv-input--sm" type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
            <Button variant="secondary" size="sm" onClick={loadReservations}>Buscar</Button>
          </div>

          {listLoading ? (
            <div className="rsv-catalog-loading"><Spinner /></div>
          ) : reservations.length === 0 ? (
            <div className="al-stub">
              <div className="al-stub-icon">📅</div>
              <div className="al-stub-title">Sin reservas</div>
              <div className="al-stub-desc">No hay reservas para la fecha seleccionada.</div>
            </div>
          ) : (
            <div className="rsv-list">
              {reservations.map((r) => (
                <div key={r.id} className="rsv-card">
                  <div className="rsv-card-header">
                    <div>
                      <div className="rsv-card-name">{r.customer_name}</div>
                      <div className="rsv-card-meta">
                        {r.phone && <span>{r.phone}</span>}
                        <span>{fmtDateDisplay(r.date)}{r.time ? ` — ${String(r.time).slice(0,5)}` : ""}</span>
                      </div>
                    </div>
                    <div className="rsv-card-total">{fmtQ(Number(r.total))}</div>
                  </div>
                  <div className="rsv-card-items">
                    {(r.items ?? []).map((i, idx) => (
                      <span key={idx} className="rsv-card-item-chip">{i.quantity}× {i.name}</span>
                    ))}
                  </div>
                  {r.notes && <div className="rsv-card-notes">Nota: {r.notes}</div>}
                  <div className="rsv-card-actions">
                    <button className="rsv-action-btn rsv-action-btn--pdf" onClick={() => generateReservationPdf(r)} title="Descargar PDF">
                      <PdfIcon /> PDF
                    </button>
                    <button className="rsv-action-btn rsv-action-btn--print" onClick={() => handlePrint(r.id)} disabled={printing === r.id} title="Imprimir ticket">
                      {printing === r.id ? <Spinner /> : <PrinterIcon />} Imprimir
                    </button>
                    <button className="rsv-action-btn rsv-action-btn--del" onClick={() => handleDelete(r.id)} title="Eliminar reserva">
                      <TrashIcon /> Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Icons ───────────────────────────────────────────────────── */

function PdfIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
