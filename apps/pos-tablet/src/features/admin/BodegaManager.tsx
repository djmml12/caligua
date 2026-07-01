import { useCallback, useEffect, useRef, useState } from "react";
import { BottomSheet, Button, FAB, Input, NumKeypad, SwipeRow, useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";
import { useKeyboard } from "../../context/KeyboardContext";
import "./BodegaManager.css";

/* ── Types ────────────────────────────────────────────────────────────────── */

interface Insumo {
  id:            number;
  nombre:        string;
  unidad_base:   string;
  stock_actual:  number;
  stock_min:     number;
  stock_critico: number;
  costo_unitario:number;
  activo:        number;
}

interface ProductoBodega {
  id:           number;
  name:         string;
  tipo_stock:   "directo" | "receta";
  receta_count: number;
  category_name?: string;
}

interface RecetaItem {
  insumo_id:           number;
  insumo_nombre:       string;
  unidad_base:         string;
  cantidad_por_porcion:number;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const fmtQ = (n: number) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ", minimumFractionDigits: 2 }).format(n);

const fmtNum = (n: number, dec = 1) => Number(n).toFixed(dec).replace(/\.0$/, "");

const safeNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const unwrap = <T,>(p: unknown): T =>
  (p && typeof p === "object" && "data" in p) ? (p as { data: T }).data : p as T;

const UNIDADES = ["pieza", "litro", "gramo", "ml", "libra"];
const UNIDADES_COMPRA: Record<string, string[]> = {
  pieza:  ["libra", "kilo", "caja", "unidad"],
  litro:  ["litro", "barril"],
  gramo:  ["gramo", "kilo", "libra"],
  ml:     ["ml", "litro", "botella"],
  libra:  ["libra", "kilo"],
};

/* ── Stock badge ──────────────────────────────────────────────────────────── */

function StockBadge({ insumo, onClick }: { insumo: Insumo; onClick: () => void }) {
  const s = insumo.stock_actual;
  const cls =
    s <= 0                    ? "bdg-stock bdg-stock--zero" :
    s <= insumo.stock_critico ? "bdg-stock bdg-stock--crit" :
    s <= insumo.stock_min     ? "bdg-stock bdg-stock--low"  :
                                "bdg-stock bdg-stock--ok";
  return (
    <button className={cls} onClick={onClick} onPointerDown={e => e.stopPropagation()}>
      <span>{fmtNum(s, s % 1 === 0 ? 0 : 1)}</span>
      <span className="bdg-stock-label">{insumo.unidad_base}</span>
    </button>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────────── */

function PlusIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function ChevronIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>;
}
function EditIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function BodegaManager({ role = "admin" }: { role?: string }) {
  const { show }            = useToast();
  const { setKeyboardOpen, keyboardEnabled } = useKeyboard();
  const mountedRef          = useRef(true);
  const canEdit             = role === "admin";

  const [subTab, setSubTab] = useState<"insumos" | "recetas">("insumos");
  const [search, setSearch] = useState("");

  const [insumos,      setInsumos]      = useState<Insumo[]>([]);
  const [productos,    setProductos]    = useState<ProductoBodega[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadingProds, setLoadingProds] = useState(false);

  /* ── Insumo form ─────────────────────────────────────────────────────────── */
  const [showInsumoForm, setShowInsumoForm] = useState(false);
  const [formMode,       setFormMode]       = useState<"create" | "edit">("create");
  const [editInsumo,     setEditInsumo]     = useState<Insumo | null>(null);
  const [fNombre,        setFNombre]        = useState("");
  const [fUnidad,        setFUnidad]        = useState("pieza");
  const [fMin,           setFMin]           = useState("");
  const [fCrit,          setFCrit]          = useState("");
  const [savingInsumo,   setSavingInsumo]   = useState(false);

  /* ── Compra sheet ────────────────────────────────────────────────────────── */
  const [showCompra,   setShowCompra]   = useState(false);
  const [compraInsumo, setCompraInsumo] = useState<Insumo | null>(null);
  const [cCantidad,    setCCantidad]    = useState("");
  const [cUnidad,      setCUnidad]      = useState("libra");
  const [cFactor,      setCFactor]      = useState("");
  const [cCosto,       setCCosto]       = useState("");
  const [cNotas,       setCNotas]       = useState("");
  const [savingCompra, setSavingCompra] = useState(false);

  /* ── Ajuste sheet ────────────────────────────────────────────────────────── */
  const [showAjuste,   setShowAjuste]   = useState(false);
  const [ajusteInsumo, setAjusteInsumo] = useState<Insumo | null>(null);
  const [ajusteVal,    setAjusteVal]    = useState("0");

  /* ── Receta editor ───────────────────────────────────────────────────────── */
  const [showReceta,   setShowReceta]   = useState(false);
  const [recetaProd,   setRecetaProd]   = useState<ProductoBodega | null>(null);
  const [recetaItems,  setRecetaItems]  = useState<RecetaItem[]>([]);
  const [showSelector, setShowSelector] = useState(false);
  const [selectorQty,  setSelectorQty]  = useState("");
  const [selectorIng,  setSelectorIng]  = useState<Insumo | null>(null);
  const [savingReceta, setSavingReceta] = useState(false);

  useEffect(() => {
    setKeyboardOpen(keyboardEnabled && (showInsumoForm || showCompra));
  }, [showInsumoForm, showCompra, setKeyboardOpen, keyboardEnabled]);

  /* ── Load ────────────────────────────────────────────────────────────────── */

  const loadInsumos = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await apiRequest("/bodega/insumos");
      if (mountedRef.current) setInsumos(unwrap<Insumo[]>(raw));
    } catch {
      if (mountedRef.current) show("Error cargando insumos", { type: "error" });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [show]);

  const loadProductos = useCallback(async () => {
    if (productos.length) return;
    setLoadingProds(true);
    try {
      const raw = await apiRequest("/bodega/productos");
      if (mountedRef.current) setProductos(unwrap<ProductoBodega[]>(raw));
    } catch {
      if (mountedRef.current) show("Error cargando productos", { type: "error" });
    } finally {
      if (mountedRef.current) setLoadingProds(false);
    }
  }, [show, productos.length]);

  useEffect(() => {
    mountedRef.current = true;
    void loadInsumos();
    return () => { mountedRef.current = false; };
  }, [loadInsumos]);

  useEffect(() => {
    if (subTab === "recetas") void loadProductos();
  }, [subTab, loadProductos]);

  /* ── Insumo CRUD ─────────────────────────────────────────────────────────── */

  const openCreate = () => {
    setFormMode("create"); setEditInsumo(null);
    setFNombre(""); setFUnidad("pieza"); setFMin(""); setFCrit("");
    setShowInsumoForm(true);
  };

  const openEdit = (ins: Insumo) => {
    setFormMode("edit"); setEditInsumo(ins);
    setFNombre(ins.nombre); setFUnidad(ins.unidad_base);
    setFMin(String(ins.stock_min)); setFCrit(String(ins.stock_critico));
    setShowInsumoForm(true);
  };

  const handleSaveInsumo = async () => {
    if (!fNombre.trim()) { show("Nombre requerido", { type: "warning" }); return; }
    setSavingInsumo(true);
    try {
      const body = { nombre: fNombre.trim(), unidad_base: fUnidad, stock_min: safeNum(fMin), stock_critico: safeNum(fCrit) };
      if (formMode === "create") {
        const created = unwrap<Insumo>(await apiRequest("/bodega/insumos", { method: "POST", body: JSON.stringify(body) }));
        if (mountedRef.current) setInsumos(p => [...p, created]);
        show("Insumo creado", { type: "success" });
      } else {
        const updated = unwrap<Insumo>(await apiRequest(`/bodega/insumos/${editInsumo!.id}`, { method: "PUT", body: JSON.stringify(body) }));
        if (mountedRef.current) setInsumos(p => p.map(x => x.id === updated.id ? updated : x));
        show("Insumo actualizado", { type: "success" });
      }
      if (mountedRef.current) setShowInsumoForm(false);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Error al guardar", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingInsumo(false);
    }
  };

  const handleDeleteInsumo = async (ins: Insumo) => {
    try {
      await apiRequest(`/bodega/insumos/${ins.id}`, { method: "DELETE" });
      if (mountedRef.current) setInsumos(p => p.filter(x => x.id !== ins.id));
      show(`"${ins.nombre}" eliminado`, { type: "info" });
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Error al eliminar", { type: "error" });
    }
  };

  /* ── Compra ──────────────────────────────────────────────────────────────── */

  const openCompra = (ins: Insumo) => {
    setCompraInsumo(ins);
    setCCantidad(""); setCFactor(""); setCCosto(""); setCNotas("");
    setCUnidad(UNIDADES_COMPRA[ins.unidad_base]?.[0] ?? "libra");
    setShowCompra(true);
  };

  const compraBase  = safeNum(cCantidad) * safeNum(cFactor) || safeNum(cCantidad);
  const compraCostU = compraBase > 0 ? safeNum(cCosto) / compraBase : 0;
  const factorNeeded = compraInsumo && compraInsumo.unidad_base !== cUnidad;

  const handleSaveCompra = async () => {
    if (!safeNum(cCantidad)) { show("Cantidad requerida", { type: "warning" }); return; }
    if (!safeNum(cCosto))    { show("Costo requerido", { type: "warning" }); return; }
    const factor = factorNeeded ? safeNum(cFactor) : 1;
    if (factorNeeded && !factor) { show("Factor de conversión requerido", { type: "warning" }); return; }
    setSavingCompra(true);
    try {
      const body = {
        cantidad_compra: safeNum(cCantidad),
        unidad_compra:   cUnidad,
        factor_a_base:   factor,
        costo_total:     safeNum(cCosto),
        notas:           cNotas || null,
      };
      const updated = unwrap<Insumo>(await apiRequest(`/bodega/insumos/${compraInsumo!.id}/compra`, { method: "POST", body: JSON.stringify(body) }));
      if (mountedRef.current) {
        setInsumos(p => p.map(x => x.id === updated.id ? updated : x));
        setShowCompra(false);
      }
      show("Compra registrada", { type: "success" });
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Error al registrar", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingCompra(false);
    }
  };

  /* ── Ajuste físico ───────────────────────────────────────────────────────── */

  const openAjuste = (ins: Insumo) => {
    setAjusteInsumo(ins);
    setAjusteVal(String(Math.max(0, Math.round(ins.stock_actual))));
    setShowAjuste(true);
  };

  const handleAjuste = async () => {
    if (!ajusteInsumo) return;
    const val = safeNum(ajusteVal);
    try {
      const updated = unwrap<Insumo>(await apiRequest(`/bodega/insumos/${ajusteInsumo.id}/ajuste`, {
        method: "POST",
        body: JSON.stringify({ nueva_cantidad: val }),
      }));
      if (mountedRef.current) {
        setInsumos(p => p.map(x => x.id === updated.id ? updated : x));
        setShowAjuste(false);
        show(`Stock ajustado a ${fmtNum(val, 1)} ${ajusteInsumo.unidad_base}`, { type: "success" });
      }
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Error al ajustar", { type: "error" });
    }
  };

  /* ── Receta ──────────────────────────────────────────────────────────────── */

  const openReceta = async (prod: ProductoBodega) => {
    setRecetaProd(prod);
    setRecetaItems([]);
    setShowReceta(true);
    try {
      const raw = await apiRequest(`/bodega/receta/${prod.id}`);
      if (mountedRef.current) setRecetaItems(unwrap<RecetaItem[]>(raw));
    } catch {
      show("Error cargando receta", { type: "error" });
    }
  };

  const openSelector = () => { setSelectorIng(null); setSelectorQty(""); setShowSelector(true); };

  const addIngredient = () => {
    if (!selectorIng) return;
    const qty = safeNum(selectorQty);
    if (!qty) { show("Ingresa la cantidad", { type: "warning" }); return; }
    setRecetaItems(p => {
      const existing = p.find(x => x.insumo_id === selectorIng!.id);
      if (existing) return p.map(x => x.insumo_id === selectorIng!.id ? { ...x, cantidad_por_porcion: qty } : x);
      return [...p, { insumo_id: selectorIng!.id, insumo_nombre: selectorIng!.nombre, unidad_base: selectorIng!.unidad_base, cantidad_por_porcion: qty }];
    });
    setShowSelector(false);
  };

  const handleSaveReceta = async () => {
    if (!recetaProd) return;
    setSavingReceta(true);
    try {
      const ingredientes = recetaItems.map(x => ({ insumo_id: x.insumo_id, cantidad_por_porcion: x.cantidad_por_porcion }));
      await apiRequest(`/bodega/receta/${recetaProd.id}`, { method: "PUT", body: JSON.stringify({ ingredientes }) });
      const tipo: "directo" | "receta" = ingredientes.length > 0 ? "receta" : "directo";
      if (mountedRef.current) {
        setProductos(p => p.map(x => x.id === recetaProd.id ? { ...x, tipo_stock: tipo, receta_count: ingredientes.length } : x));
        setShowReceta(false);
      }
      show("Receta guardada", { type: "success" });
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Error al guardar receta", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingReceta(false);
    }
  };

  /* ── Render ──────────────────────────────────────────────────────────────── */

  return (
    <>
      <div className="bdg-layout">
        <div className="bdg-header av-header">
          <h2 className="av-title">Bodega</h2>
          {canEdit && subTab === "insumos" && (
            <Button variant="secondary" size="md" onClick={openCreate}>+ Insumo</Button>
          )}
        </div>

        <div className="bdg-tabs">
          <button className={`bdg-tab${subTab === "insumos" ? " bdg-tab--active" : ""}`} onClick={() => { setSubTab("insumos"); setSearch(""); }}>
            Insumos
          </button>
          <button className={`bdg-tab${subTab === "recetas" ? " bdg-tab--active" : ""}`} onClick={() => { setSubTab("recetas"); setSearch(""); }}>
            Recetas
          </button>
        </div>

        <div className="bdg-search-bar">
          <div className="bdg-search-wrap">
            <svg className="bdg-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="bdg-search"
              placeholder={subTab === "insumos" ? "Buscar insumo..." : "Buscar receta..."}
              value={search}
              onChange={e => setSearch(e.target.value)}
              type="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {search && (
              <button
                className="bdg-search-clear"
                onClick={() => setSearch("")}
                onPointerDown={e => e.preventDefault()}
                aria-label="Borrar búsqueda"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ── INSUMOS ──────────────────────────────────────────────────────── */}
        {subTab === "insumos" && (
          <div className="bdg-list">
            {loading ? (
              <div className="bdg-empty"><div className="bdg-empty-title">Cargando...</div></div>
            ) : insumos.length === 0 ? (
              <div className="bdg-empty">
                <div className="bdg-empty-icon">📦</div>
                <div className="bdg-empty-title">Sin insumos registrados</div>
                <p style={{ fontSize: 13 }}>Agrega materias primas para controlar el stock por receta.</p>
              </div>
            ) : (() => {
              const q = search.trim().toLowerCase();
              const filtered = q ? insumos.filter(i => i.nombre.toLowerCase().includes(q)) : insumos;
              if (filtered.length === 0) return (
                <div className="bdg-empty">
                  <div className="bdg-empty-title">Sin resultados para "{search.trim()}"</div>
                </div>
              );
              return filtered.map(ins => (
                <SwipeRow
                  key={ins.id}
                  actions={canEdit ? [
                    { label: "Editar",   color: "var(--primary)", onAction: () => openEdit(ins) },
                    { label: "Eliminar", color: "var(--danger)",  onAction: () => void handleDeleteInsumo(ins) },
                  ] : []}
                >
                  <div className="bdg-row" onClick={() => openEdit(ins)}>
                    <div className="bdg-row-info">
                      <div className="bdg-row-name">{ins.nombre}</div>
                      <div className="bdg-row-meta">
                        {ins.costo_unitario > 0 ? `${fmtQ(ins.costo_unitario)} / ${ins.unidad_base}` : ins.unidad_base}
                        {ins.stock_min > 0 ? ` · mín ${fmtNum(ins.stock_min, 0)}` : ""}
                      </div>
                    </div>
                    <StockBadge insumo={ins} onClick={() => openCompra(ins)} />
                    {canEdit && (
                      <button
                        className="inv-edit-btn"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); openAjuste(ins); }}
                        aria-label="Ajuste físico"
                        title="Conteo físico"
                      >
                        <EditIcon />
                      </button>
                    )}
                  </div>
                </SwipeRow>
              ));
            })()}
          </div>
        )}

        {/* ── RECETAS ──────────────────────────────────────────────────────── */}
        {subTab === "recetas" && (
          <div className="bdg-list">
            {loadingProds ? (
              <div className="bdg-empty"><div className="bdg-empty-title">Cargando...</div></div>
            ) : productos.length === 0 ? (
              <div className="bdg-empty">
                <div className="bdg-empty-icon">📋</div>
                <div className="bdg-empty-title">Sin productos</div>
              </div>
            ) : (() => {
              const q = search.trim().toLowerCase();
              const filtered = q ? productos.filter(p => p.name.toLowerCase().includes(q)) : productos;
              if (filtered.length === 0) return (
                <div className="bdg-empty">
                  <div className="bdg-empty-title">Sin resultados para "{search.trim()}"</div>
                </div>
              );
              return filtered.map(prod => (
                <div key={prod.id} className="bdg-prod-row" onClick={() => void openReceta(prod)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="bdg-prod-name">{prod.name}</div>
                    {prod.category_name && <div className="bdg-prod-cat">{prod.category_name}</div>}
                  </div>
                  {prod.tipo_stock === "receta" ? (
                    <span className="bdg-tipo-badge bdg-tipo-badge--receta">
                      Receta · {prod.receta_count} ing.
                    </span>
                  ) : (
                    <span className="bdg-tipo-badge bdg-tipo-badge--directo">Directo</span>
                  )}
                  <ChevronIcon />
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      {canEdit && subTab === "insumos" && (
        <FAB icon={<PlusIcon />} label="Insumo" position="bottom-right" onClick={openCreate} />
      )}

      {/* ── Crear / Editar Insumo ──────────────────────────────────────────── */}
      <BottomSheet
        open={showInsumoForm}
        onClose={() => !savingInsumo && setShowInsumoForm(false)}
        height="auto"
        title={formMode === "create" ? "Nuevo insumo" : "Editar insumo"}
        draggable={!savingInsumo}
      >
        <div className="bdg-form">
          <Input label="Nombre del insumo" value={fNombre} onChange={e => setFNombre(e.target.value)} autoComplete="off" />
          <div className="bdg-field">
            <div className="bdg-label">Unidad de inventario</div>
            <select className="bdg-select" value={fUnidad} onChange={e => setFUnidad(e.target.value)}>
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Input label={`Stock mínimo (${fUnidad})`}  type="number" inputMode="decimal" value={fMin}  onChange={e => setFMin(e.target.value)} />
            <Input label={`Stock crítico (${fUnidad})`} type="number" inputMode="decimal" value={fCrit} onChange={e => setFCrit(e.target.value)} />
          </div>
          <Button variant="primary" size="xl" fullWidth loading={savingInsumo} onClick={() => void handleSaveInsumo()}>
            {formMode === "create" ? "Crear insumo" : "Guardar cambios"}
          </Button>
        </div>
      </BottomSheet>

      {/* ── Registrar Compra ────────────────────────────────────────────────── */}
      <BottomSheet
        open={showCompra}
        onClose={() => !savingCompra && setShowCompra(false)}
        height="auto"
        title={compraInsumo ? `Compra — ${compraInsumo.nombre}` : "Registrar compra"}
        draggable={!savingCompra}
      >
        <div className="bdg-form">
          <div style={{ display: "flex", gap: 10 }}>
            <Input label="Cantidad comprada" type="number" inputMode="decimal" value={cCantidad} onChange={e => setCCantidad(e.target.value)} />
            <div className="bdg-field" style={{ minWidth: 110 }}>
              <div className="bdg-label">Unidad</div>
              <select className="bdg-select" value={cUnidad} onChange={e => setCUnidad(e.target.value)}>
                {(UNIDADES_COMPRA[compraInsumo?.unidad_base ?? "pieza"] ?? ["libra"]).map(u =>
                  <option key={u} value={u}>{u}</option>
                )}
              </select>
            </div>
          </div>

          {factorNeeded && (
            <Input
              label={`${compraInsumo?.unidad_base ?? "piezas"} por ${cUnidad}`}
              type="number" inputMode="decimal"
              value={cFactor} onChange={e => setCFactor(e.target.value)}
              placeholder={`Ej: 10 ${compraInsumo?.unidad_base ?? "piezas"} por ${cUnidad}`}
            />
          )}

          <Input label="Costo total de la compra (Q)" type="number" inputMode="decimal" value={cCosto} onChange={e => setCCosto(e.target.value)} />

          {compraBase > 0 && safeNum(cCosto) > 0 && (
            <div className="bdg-preview">
              Entran: <strong>{fmtNum(compraBase, 1)} {compraInsumo?.unidad_base}</strong>
              {" · "}Costo: <strong>{fmtQ(compraCostU)} / {compraInsumo?.unidad_base}</strong>
            </div>
          )}

          <Input label="Notas (opcional)" value={cNotas} onChange={e => setCNotas(e.target.value)} autoComplete="off" />

          <Button variant="primary" size="xl" fullWidth loading={savingCompra} onClick={() => void handleSaveCompra()}>
            Registrar compra
          </Button>
        </div>
      </BottomSheet>

      {/* ── Ajuste físico ───────────────────────────────────────────────────── */}
      <BottomSheet
        open={showAjuste}
        onClose={() => setShowAjuste(false)}
        height="auto"
        title={ajusteInsumo ? `Conteo físico — ${ajusteInsumo.nombre}` : "Ajuste de stock"}
      >
        {ajusteInsumo && (
          <div style={{ padding: "0 16px 24px" }}>
            <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 12 }}>
              Stock actual en sistema: <strong>{fmtNum(ajusteInsumo.stock_actual, 1)} {ajusteInsumo.unidad_base}</strong>
            </p>
            <NumKeypad
              value={ajusteVal}
              onChange={setAjusteVal}
              showConfirm
              onConfirm={() => void handleAjuste()}
              displayLabel={`Nueva cantidad (${ajusteInsumo.unidad_base})`}
            />
          </div>
        )}
      </BottomSheet>

      {/* ── Editor de Receta ─────────────────────────────────────────────────── */}
      <BottomSheet
        open={showReceta}
        onClose={() => !savingReceta && setShowReceta(false)}
        height="full"
        title={recetaProd ? `Receta — ${recetaProd.name}` : "Receta"}
        draggable={!savingReceta}
      >
        <div className="bdg-receta-wrap">
          {recetaItems.length === 0 ? (
            <div style={{ padding: "20px 0 16px", color: "var(--text-3)", fontSize: 13, textAlign: "center" }}>
              Sin ingredientes. Agrega uno para activar el inventario por receta.
            </div>
          ) : (
            <div className="bdg-ing-list">
              {recetaItems.map(item => (
                <div key={item.insumo_id} className="bdg-ing-row">
                  <div className="bdg-ing-info">
                    <div className="bdg-ing-name">{item.insumo_nombre}</div>
                    <div className="bdg-ing-qty">{fmtNum(item.cantidad_por_porcion, item.cantidad_por_porcion % 1 === 0 ? 0 : 1)} {item.unidad_base} por porción</div>
                  </div>
                  <button
                    className="bdg-ing-remove"
                    onClick={() => setRecetaItems(p => p.filter(x => x.insumo_id !== item.insumo_id))}
                  >×</button>
                </div>
              ))}
            </div>
          )}

          {canEdit && (
            <button className="bdg-add-ing-btn" onClick={openSelector}>
              <span style={{ fontSize: 18 }}>+</span> Agregar ingrediente
            </button>
          )}

          <Button variant="primary" size="xl" fullWidth loading={savingReceta} onClick={() => void handleSaveReceta()}>
            {recetaItems.length > 0 ? "Guardar receta" : "Guardar sin receta (stock directo)"}
          </Button>
        </div>
      </BottomSheet>

      {/* ── Selector de insumo ───────────────────────────────────────────────── */}
      <BottomSheet
        open={showSelector}
        onClose={() => setShowSelector(false)}
        height="auto"
        title="Seleccionar ingrediente"
      >
        {selectorIng ? (
          <div className="bdg-form">
            <p style={{ fontSize: 13, color: "var(--text-2)" }}>
              <strong>{selectorIng.nombre}</strong> · {selectorIng.unidad_base}
            </p>
            <Input
              label={`Cantidad por porción (${selectorIng.unidad_base})`}
              type="number" inputMode="decimal"
              value={selectorQty}
              onChange={e => setSelectorQty(e.target.value)}
              placeholder="Ej: 8"
              autoComplete="off"
            />
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" size="lg" onClick={() => setSelectorIng(null)}>Atrás</Button>
              <Button variant="primary" size="lg" fullWidth onClick={addIngredient}>Agregar</Button>
            </div>
          </div>
        ) : (
          <div className="bdg-selector-list">
            {insumos.filter(i => i.activo).map(ins => (
              <button key={ins.id} className="bdg-selector-item" onClick={() => setSelectorIng(ins)}>
                <span>{ins.nombre}</span>
                <span className="bdg-selector-unit">{ins.unidad_base}</span>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
