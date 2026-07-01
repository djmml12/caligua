import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  BottomSheet, Button, FAB, Input, NumKeypad, SwipeRow, useToast,
} from "@pos/ui-kit";
import { apiRequest } from "../../services/api";
import { useKeyboard } from "../../context/KeyboardContext";

/* ── Types ────────────────────────────────────────────────── */

interface Category {
  id: number;
  name: string;
  is_active: boolean;
  parent_id: number | null;
}

interface Product {
  id: number;
  name: string;
  price: number;
  cost_price: number;
  stock: number;
  tipo_stock: "directo" | "receta";
  is_active: boolean;
}

type ProductDraft = Partial<Omit<Product, "id" | "is_active">>;

/* ── Helpers ──────────────────────────────────────────────── */

const fmt = (n: number) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ", minimumFractionDigits: 2 }).format(n);

const safeNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const unwrap = <T,>(p: unknown): T =>
  (p && typeof p === "object" && "data" in p) ? (p as { data: T }).data : p as T;

const normalizeProduct = (x: unknown): Product => {
  const i = x as Record<string, unknown>;
  return {
    id:         safeNum(i.id),
    name:       String(i.name ?? ""),
    price:      safeNum(i.price),
    cost_price: safeNum(i.cost_price),
    stock:      safeNum(i.stock),
    tipo_stock: i.tipo_stock === "receta" ? "receta" : "directo",
    is_active:  Boolean(i.is_active),
  };
};

/* ── Icons ────────────────────────────────────────────────── */

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/* ── Component ────────────────────────────────────────────── */

interface Props {
  role?: string;
}

export default function InventoryManager({ role = "admin" }: Props) {
  const { show } = useToast();
  const { setKeyboardOpen } = useKeyboard();
  const mountedRef = useRef(true);

  const canEdit   = role === "admin";
  const canStock  = role === "admin" || role === "supervisor";

  /* Data */
  const [categories,    setCategories]    = useState<Category[]>([]);
  const [products,      setProducts]      = useState<Product[]>([]);
  const [selectedCat,   setSelectedCat]   = useState<number | null>(null);
  const [loadingCats,   setLoadingCats]   = useState(true);
  const [loadingProds,  setLoadingProds]  = useState(false);

  /* Search */
  const [search,      setSearch]      = useState("");
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const allLoadedRef  = useRef(false);
  const deferredSearch = useDeferredValue(search);

  /* Thresholds */
  const [lowThreshold,  setLowThreshold]  = useState(15);
  const [critThreshold, setCritThreshold] = useState(5);

  /* Product form BottomSheet */
  const [showForm,   setShowForm]   = useState(false);
  const [formMode,   setFormMode]   = useState<"add" | "edit">("add");
  const [editId,     setEditId]     = useState<number | null>(null);
  const [draft,      setDraft]      = useState<ProductDraft>({});
  const [saving,     setSaving]     = useState(false);

  /* Auto-open virtual keyboard while product form is active */
  useEffect(() => {
    setKeyboardOpen(showForm);
  }, [showForm, setKeyboardOpen]);

  /* Stock adjust BottomSheet */
  const [showStock,   setShowStock]   = useState(false);
  const [stockTarget, setStockTarget] = useState<Product | null>(null);
  const [stockValue,  setStockValue]  = useState("0");

  /* Category form BottomSheet */
  const [showCatForm,  setShowCatForm]  = useState(false);
  const [newCatName,   setNewCatName]   = useState("");
  const [savingCat,    setSavingCat]    = useState(false);

  /* Category edit BottomSheet */
  const [showCatEdit,      setShowCatEdit]      = useState(false);
  const [editCatId,        setEditCatId]        = useState<number | null>(null);
  const [editCatNameDraft, setEditCatNameDraft] = useState("");
  const [savingCatRename,  setSavingCatRename]  = useState(false);
  const [deletingCat,      setDeletingCat]      = useState(false);

  /* Stock thresholds BottomSheet */
  const [showThresholds,  setShowThresholds]  = useState(false);
  const [draftLow,        setDraftLow]        = useState("");
  const [draftCrit,       setDraftCrit]       = useState("");
  const [savingThresh,    setSavingThresh]    = useState(false);

  /* ── Load ──────────────────────────────────────────────── */

  const loadCategories = useCallback(async () => {
    setLoadingCats(true);
    try {
      const raw = await apiRequest("/categories?includeInactive=true");
      const data = (unwrap<unknown[]>(raw) as unknown[]).map(x => {
        const i = x as Record<string, unknown>;
        return {
          id:        safeNum(i.id),
          name:      String(i.name ?? ""),
          is_active: Boolean(i.is_active),
          parent_id: i.parent_id === null || i.parent_id === undefined ? null : safeNum(i.parent_id),
        } as Category;
      });
      if (!mountedRef.current) return;
      setCategories(data);
      const first = data[0];
      if (first) {
        setSelectedCat(first.id);
        await loadProductsFor(first.id);
      }
    } catch {
      if (mountedRef.current) show("Error cargando categorías", { type: "error" });
    } finally {
      if (mountedRef.current) setLoadingCats(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const loadProductsFor = async (catId: number) => {
    setLoadingProds(true);
    try {
      const raw = await apiRequest(`/products?category_id=${catId}&includeInactive=true`);
      const data = (unwrap<unknown[]>(raw) as unknown[]).map(normalizeProduct);
      if (mountedRef.current) setProducts(data);
    } catch {
      if (mountedRef.current) show("Error cargando productos", { type: "error" });
    } finally {
      if (mountedRef.current) setLoadingProds(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void loadCategories();
    void apiRequest("/settings/stock-thresholds").then((r: unknown) => {
      const d = r as Record<string, unknown>;
      const inner = (d?.data as Record<string, unknown>) ?? d;
      if (mountedRef.current) {
        setLowThreshold(safeNum(inner?.lowStock  ?? 15));
        setCritThreshold(safeNum(inner?.criticalStock ?? 5));
      }
    }).catch(() => {/* non-critical */});
    return () => { mountedRef.current = false; };
  }, [loadCategories]);

  /* ── Category select ───────────────────────────────────── */

  const selectCategory = (id: number) => {
    setSelectedCat(id);
    void loadProductsFor(id);
  };

  /* ── Product form ──────────────────────────────────────── */

  const openAdd = () => {
    setFormMode("add");
    setEditId(null);
    setDraft({ name: "" });
    setShowForm(true);
  };

  const openEdit = (p: Product) => {
    setFormMode("edit");
    setEditId(p.id);
    setDraft({ name: p.name, price: p.price, cost_price: p.cost_price, stock: p.stock });
    setShowForm(true);
  };

  const handleSaveProduct = async () => {
    if (!draft.name?.trim())                          { show("El nombre es requerido", { type: "warning" }); return; }
    if (!selectedCat)                                 { show("Selecciona una categoría", { type: "warning" }); return; }
    if (draft.price == null || draft.price <= 0)      { show("Precio requerido", { type: "warning" }); return; }

    setSaving(true);
    try {
      const body = {
        name:        draft.name.trim(),
        price:       safeNum(draft.price),
        cost_price:  safeNum(draft.cost_price),
        stock:       safeNum(draft.stock),
        category_id: selectedCat,
      };

      if (formMode === "add") {
        const created = await apiRequest("/products", {
          method: "POST",
          body: JSON.stringify(body),
        });
        const p = normalizeProduct(unwrap(created));
        if (mountedRef.current) {
          setProducts(prev => [...prev, p]);
          setAllProducts(prev => [...prev, p]);
        }
        show("Producto creado", { type: "success" });
      } else {
        const updated = await apiRequest(`/products/${editId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        const p = normalizeProduct(unwrap(updated));
        if (mountedRef.current) {
          setProducts(prev => prev.map(x => x.id === p.id ? p : x));
          setAllProducts(prev => prev.map(x => x.id === p.id ? p : x));
        }
        show("Producto actualizado", { type: "success" });
      }

      if (mountedRef.current) setShowForm(false);
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al guardar", { type: "error" });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  /* ── Toggle active ─────────────────────────────────────── */

  const toggleActive = async (p: Product) => {
    try {
      await apiRequest(`/products/${p.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !p.is_active }),
      });
      if (mountedRef.current) {
        const toggle = (x: Product) => x.id === p.id ? { ...x, is_active: !x.is_active } : x;
        setProducts(prev => prev.map(toggle));
        setAllProducts(prev => prev.map(toggle));
        show(p.is_active ? "Producto desactivado" : "Producto activado", { type: "info" });
      }
    } catch {
      show("Error al actualizar", { type: "error" });
    }
  };

  /* ── Delete product ────────────────────────────────────── */

  const deleteProduct = async (p: Product) => {
    try {
      await apiRequest(`/products/${p.id}`, { method: "DELETE" });
      if (mountedRef.current) {
        setProducts(prev => prev.filter(x => x.id !== p.id));
        setAllProducts(prev => prev.filter(x => x.id !== p.id));
        show(`"${p.name}" eliminado`, {
          type: "info",
          action: { label: "Deshacer", onClick: () => void loadProductsFor(selectedCat!) },
        });
      }
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al eliminar", { type: "error" });
    }
  };

  /* ── Stock adjust ──────────────────────────────────────── */

  const openStockAdjust = (p: Product) => {
    setStockTarget(p);
    setStockValue(String(p.stock));
    setShowStock(true);
  };

  const handleStockConfirm = async () => {
    if (!stockTarget) return;
    const entered = parseInt(stockValue, 10);
    if (!Number.isFinite(entered) || entered < 0) { show("Stock inválido", { type: "warning" }); return; }
    const deficit = stockTarget.stock < 0 ? stockTarget.stock : 0;
    const finalStock = entered + deficit;
    try {
      await apiRequest(`/products/${stockTarget.id}`, {
        method: "PUT",
        body: JSON.stringify({ stock: finalStock }),
      });
      if (mountedRef.current) {
        const updateStock = (x: Product) => x.id === stockTarget.id ? { ...x, stock: finalStock } : x;
        setProducts(prev => prev.map(updateStock));
        setAllProducts(prev => prev.map(updateStock));
        setShowStock(false);
        show(`Stock actualizado a ${finalStock}`, { type: "success" });
      }
    } catch {
      show("Error al actualizar stock", { type: "error" });
    }
  };

  /* ── Create category ───────────────────────────────────── */

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    setSavingCat(true);
    try {
      const created = await apiRequest("/categories", {
        method: "POST",
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      const c = created as Record<string, unknown>;
      const inner = (c?.data ?? c) as Record<string, unknown>;
      const newCat: Category = { id: safeNum(inner.id), name: String(inner.name), is_active: true, parent_id: null };
      if (mountedRef.current) {
        setCategories(prev => [...prev, newCat]);
        setNewCatName("");
        setShowCatForm(false);
        selectCategory(newCat.id);
        show("Categoría creada", { type: "success" });
      }
    } catch {
      show("Error al crear categoría", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingCat(false);
    }
  };

  /* ── Edit / delete category ───────────────────────────── */

  const openEditCat = (cat: Category) => {
    setEditCatId(cat.id);
    setEditCatNameDraft(cat.name);
    setShowCatEdit(true);
  };

  const handleRenameCategory = async () => {
    if (!editCatNameDraft.trim() || !editCatId) return;
    setSavingCatRename(true);
    try {
      await apiRequest(`/categories/${editCatId}`, {
        method: "PUT",
        body: JSON.stringify({ name: editCatNameDraft.trim() }),
      });
      if (mountedRef.current) {
        setCategories(prev => prev.map(c => c.id === editCatId ? { ...c, name: editCatNameDraft.trim() } : c));
        setShowCatEdit(false);
        show("Categoría renombrada", { type: "success" });
      }
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al renombrar", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingCatRename(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!editCatId) return;
    setDeletingCat(true);
    try {
      await apiRequest(`/categories/${editCatId}`, { method: "DELETE" });
      if (mountedRef.current) {
        const remaining = categories.filter(c => c.id !== editCatId);
        setCategories(remaining);
        setShowCatEdit(false);
        if (selectedCat === editCatId) {
          if (remaining.length > 0) {
            selectCategory(remaining[0].id);
          } else {
            setSelectedCat(null);
            setProducts([]);
          }
        }
        show("Categoría eliminada", { type: "success" });
      }
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al eliminar", { type: "error" });
    } finally {
      if (mountedRef.current) setDeletingCat(false);
    }
  };

  /* ── Threshold sheet handlers ─────────────────────────── */

  const openThresholds = () => {
    setDraftLow(String(lowThreshold));
    setDraftCrit(String(critThreshold));
    setShowThresholds(true);
  };

  const threshLowNum  = safeNum(draftLow)  || 0;
  const threshCritNum = safeNum(draftCrit) || 0;
  const threshError   =
    draftLow  === "" ? "El límite de stock bajo es requerido." :
    threshLowNum < 1 ? "Stock bajo debe ser al menos 1." :
    threshCritNum > threshLowNum ? "Stock crítico no puede ser mayor que stock bajo." :
    null;

  const handleSaveThresholds = async () => {
    if (threshError) return;
    setSavingThresh(true);
    try {
      await apiRequest("/settings/stock-thresholds", {
        method: "PUT",
        body: JSON.stringify({ lowStock: threshLowNum, criticalStock: threshCritNum }),
      });
      if (mountedRef.current) {
        setLowThreshold(threshLowNum);
        setCritThreshold(threshCritNum);
        setShowThresholds(false);
        show("Límites de stock guardados", { type: "success" });
      }
    } catch {
      if (mountedRef.current) show("Error guardando límites", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingThresh(false);
    }
  };

  /* ── Search: lazy-load all products on first query ──────── */

  useEffect(() => {
    if (!deferredSearch.trim() || allLoadedRef.current) return;
    allLoadedRef.current = true;
    void apiRequest("/products?includeInactive=true").then(raw => {
      const data = (unwrap<unknown[]>(raw) as unknown[]).map(normalizeProduct);
      if (mountedRef.current) setAllProducts(data);
    }).catch(() => {});
  }, [deferredSearch]);

  const visibleProducts = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return products;
    const source = allLoadedRef.current && allProducts.length > 0 ? allProducts : products;
    return source.filter(p => p.name.toLowerCase().includes(q));
  }, [deferredSearch, products, allProducts]);

  /* ── Stock badge ───────────────────────────────────────── */

  const stockClass = (s: number) => {
    if (s === 0)               return "inv-stock-badge inv-stock-badge--zero";
    if (s <= critThreshold)    return "inv-stock-badge inv-stock-badge--crit";
    if (s <= lowThreshold)     return "inv-stock-badge inv-stock-badge--low";
    return "inv-stock-badge inv-stock-badge--ok";
  };

  /* ── Render ────────────────────────────────────────────── */

  const topLevel = categories.filter(c => c.parent_id === null);
  const subCats  = categories.filter(c => c.parent_id !== null);

  /* flat list: top-level first, then sub-categories */
  const orderedCats: Category[] = [];
  topLevel.forEach(c => {
    orderedCats.push(c);
    subCats.filter(s => s.parent_id === c.id).forEach(s => orderedCats.push(s));
  });

  return (
    <>
      <div className="inv-layout">
        {/* Header */}
        <div className="av-header">
          <h2 className="av-title">Inventario</h2>
          <div style={{ display: "flex", gap: 8 }}>
            {canEdit && (
              <Button variant="secondary" size="md" onClick={() => setShowCatForm(true)}>
                + Categoría
              </Button>
            )}
            {canEdit && (
              <Button variant="secondary" size="md" onClick={openThresholds} aria-label="Configurar límites de stock">
                <GearIcon />
              </Button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="inv-search-wrap">
          <span className="inv-search-icon"><SearchIcon /></span>
          <input
            className="inv-search"
            type="search"
            placeholder="Buscar producto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {search && (
            <button
              className="inv-search-clear"
              onClick={() => setSearch("")}
              onPointerDown={e => e.preventDefault()}
              aria-label="Borrar búsqueda"
            >
              <XIcon />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div className="inv-cats">
          {loadingCats ? (
            <span style={{ fontSize: 13, color: "var(--text-3)" }}>Cargando...</span>
          ) : orderedCats.length === 0 ? (
            <span style={{ fontSize: 13, color: "var(--text-3)" }}>Sin categorías</span>
          ) : (
            orderedCats.map(cat => {
              const isSelected = selectedCat === cat.id;
              return (
                <div key={cat.id} className="inv-cat-chip-wrap">
                  <button
                    className={`inv-cat-chip${isSelected ? " inv-cat-chip--active" : ""}${!cat.is_active ? " inv-product-inactive" : ""}`}
                    onClick={() => selectCategory(cat.id)}
                    style={cat.parent_id !== null ? { paddingLeft: 20, fontSize: 12 } : undefined}
                  >
                    {cat.parent_id !== null ? "↳ " : ""}{cat.name}
                  </button>
                  {canEdit && isSelected && (
                    <button
                      className="inv-cat-edit-btn"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => openEditCat(cat)}
                      aria-label={`Editar categoría ${cat.name}`}
                    >
                      <EditIcon />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Products list */}
        <div className="inv-products">
          {loadingProds ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-3)", fontWeight: 600 }}>
              Cargando productos...
            </div>
          ) : visibleProducts.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
              <p style={{ fontWeight: 700 }}>
                {search ? "Sin resultados para esa búsqueda" : "Sin productos en esta categoría"}
              </p>
              {!search && canEdit && <p style={{ marginTop: 8, fontSize: 13 }}>Usa el botón + para agregar</p>}
            </div>
          ) : (
            visibleProducts.map(product => (
              <SwipeRow
                key={product.id}
                actions={canEdit ? [
                  {
                    label:    product.is_active ? "Desact." : "Activar",
                    color:    product.is_active ? "var(--warning)" : "var(--success)",
                    onAction: () => void toggleActive(product),
                  },
                  {
                    label:    "Eliminar",
                    icon:     <TrashIcon />,
                    color:    "var(--danger)",
                    onAction: () => void deleteProduct(product),
                  },
                ] : []}
              >
                <div className={`inv-product-row${!product.is_active ? " inv-product-inactive" : ""}`}>
                  <div className="inv-product-info">
                    <div className="inv-product-name">{product.name}</div>
                    <div className="inv-product-meta">
                      Costo: {fmt(product.cost_price)}
                    </div>
                  </div>

                  {/* Stock — tap to adjust */}
                  {canStock ? (
                    <button
                      className={stockClass(product.stock)}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => openStockAdjust(product)}
                      aria-label={`Stock: ${product.stock}. Toca para ajustar`}
                    >
                      {product.stock}
                    </button>
                  ) : (
                    <span className={stockClass(product.stock)} style={{ cursor: "default" }}>
                      {product.stock}
                    </span>
                  )}

                  <span className="inv-price-badge">{fmt(product.price)}</span>

                  {canEdit && (
                    <button
                      type="button"
                      className="inv-edit-btn"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => openEdit(product)}
                      aria-label={`Editar ${product.name}`}
                    >
                      <EditIcon />
                    </button>
                  )}
                </div>
              </SwipeRow>
            ))
          )}
        </div>
      </div>

      {/* FAB — add product */}
      {canEdit && (
        <FAB
          icon={<PlusIcon />}
          label="Agregar"
          position="bottom-right"
          onClick={openAdd}
          aria-label="Agregar producto"
        />
      )}

      {/* ── Product form BottomSheet ──────────────── */}
      <BottomSheet
        open={showForm}
        onClose={() => !saving && setShowForm(false)}
        height="full"
        title={formMode === "add" ? "Nuevo producto" : "Editar producto"}
        draggable={!saving}
      >
        <div className="al-form">
          <Input
            label="Nombre del producto"
            value={draft.name ?? ""}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            autoComplete="off"
          />
          <div className="al-form-row">
            <Input
              label="Precio de venta"
              type="number"
              inputMode="decimal"
              value={draft.price != null ? String(draft.price) : ""}
              onChange={e => setDraft(d => ({ ...d, price: e.target.value === "" ? undefined : safeNum(e.target.value) }))}
            />
            <Input
              label="Costo"
              type="number"
              inputMode="decimal"
              value={draft.cost_price != null ? String(draft.cost_price) : ""}
              onChange={e => setDraft(d => ({ ...d, cost_price: e.target.value === "" ? undefined : safeNum(e.target.value) }))}
            />
          </div>
          <Input
            label="Stock inicial"
            type="number"
            inputMode="numeric"
            value={draft.stock != null ? String(draft.stock) : ""}
            onChange={e => setDraft(d => ({ ...d, stock: e.target.value === "" ? undefined : safeNum(e.target.value) }))}
          />
          <Button
            variant="primary"
            size="xl"
            fullWidth
            loading={saving}
            onClick={() => void handleSaveProduct()}
          >
            {formMode === "add" ? "Crear producto" : "Guardar cambios"}
          </Button>
        </div>
      </BottomSheet>

      {/* ── Stock adjust BottomSheet ──────────────── */}
      <BottomSheet
        open={showStock}
        onClose={() => setShowStock(false)}
        height="auto"
        title={stockTarget ? `Stock — ${stockTarget.name}` : "Ajustar stock"}
      >
        <div style={{ padding: "0 16px 24px" }}>
          {stockTarget?.tipo_stock === "receta" ? (
            <div style={{ padding: "8px 4px 4px", display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
                Este producto controla su stock por receta.
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)", lineHeight: 1.5 }}>
                Su stock ({stockTarget.stock}) se calcula a partir de los insumos que consume.
                Para corregirlo, ajusta el stock de esos insumos desde <strong>Bodega</strong>.
              </p>
              <Button variant="secondary" size="lg" fullWidth onClick={() => setShowStock(false)}>
                Entendido
              </Button>
            </div>
          ) : (
            <NumKeypad
              value={stockValue}
              onChange={setStockValue}
              showConfirm
              onConfirm={() => void handleStockConfirm()}
              displayLabel={
                stockTarget && stockTarget.stock < 0
                  ? `Ingresar unidades (déficit actual: ${stockTarget.stock})`
                  : "Nueva cantidad en stock"
              }
            />
          )}
        </div>
      </BottomSheet>

      {/* ── New category BottomSheet ──────────────── */}
      <BottomSheet
        open={showCatForm}
        onClose={() => !savingCat && setShowCatForm(false)}
        height="auto"
        title="Nueva categoría"
        draggable={!savingCat}
      >
        <div className="al-form">
          <Input
            label="Nombre de la categoría"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void handleCreateCategory(); }}
            autoComplete="off"
          />
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={savingCat}
            onClick={() => void handleCreateCategory()}
          >
            Crear categoría
          </Button>
        </div>
      </BottomSheet>

      {/* ── Edit category BottomSheet ────────────── */}
      <BottomSheet
        open={showCatEdit}
        onClose={() => !(savingCatRename || deletingCat) && setShowCatEdit(false)}
        height="auto"
        title="Editar categoría"
        draggable={!(savingCatRename || deletingCat)}
      >
        <div className="al-form">
          <Input
            label="Nombre de la categoría"
            value={editCatNameDraft}
            onChange={e => setEditCatNameDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void handleRenameCategory(); }}
            autoComplete="off"
          />
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={savingCatRename}
            disabled={deletingCat || !editCatNameDraft.trim()}
            onClick={() => void handleRenameCategory()}
          >
            Renombrar
          </Button>
          <Button
            variant="danger"
            size="lg"
            fullWidth
            loading={deletingCat}
            disabled={savingCatRename}
            onClick={() => void handleDeleteCategory()}
          >
            Eliminar categoría
          </Button>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>
            Solo se puede eliminar si no tiene productos ni subcategorías.
          </p>
        </div>
      </BottomSheet>

      {/* ── Stock thresholds BottomSheet ──────────── */}
      <BottomSheet
        open={showThresholds}
        onClose={() => !savingThresh && setShowThresholds(false)}
        height="auto"
        title="Límites de stock"
        draggable={!savingThresh}
      >
        <div className="al-form">

          {/* Preview badges */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "0 0 4px" }}>
            <span className="inv-stock-badge inv-stock-badge--ok">24</span>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>Normal</span>
            <span className="inv-stock-badge inv-stock-badge--low">{threshLowNum || "—"}</span>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>Bajo</span>
            <span className="inv-stock-badge inv-stock-badge--crit">{threshCritNum}</span>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>Crítico</span>
            <span className="inv-stock-badge inv-stock-badge--zero">0</span>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>Sin stock</span>
          </div>

          <Input
            label="Stock bajo (≥ 1)"
            type="number"
            inputMode="numeric"
            value={draftLow}
            onChange={e => setDraftLow(e.target.value)}
          />
          <Input
            label="Stock crítico (≥ 0)"
            type="number"
            inputMode="numeric"
            value={draftCrit}
            onChange={e => setDraftCrit(e.target.value)}
          />

          {threshError && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--danger)", fontWeight: 600 }}>
              {threshError}
            </p>
          )}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={savingThresh}
            disabled={!!threshError}
            onClick={() => void handleSaveThresholds()}
          >
            Guardar límites
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
