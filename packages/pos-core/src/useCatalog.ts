import {
  useCallback, useDeferredValue, useEffect, useMemo, useRef, useState,
  type Dispatch, type SetStateAction,
} from "react";
import { apiRequest } from "@pos/api-client";
import { useToast }   from "@pos/ui-kit";
import type { Product, Category } from "@pos/types";

export interface UseCatalogResult {
  products:         Product[];
  /** Setter expuesto para casos como reordenar via DnD a nivel UI */
  setProducts:      Dispatch<SetStateAction<Product[]>>;
  categories:       Category[];
  loading:          boolean;
  search:           string;
  setSearch:        (v: string) => void;
  selectedCat:      number | null;
  setSelectedCat:   (id: number | null) => void;
  filteredProducts: Product[];
  /** Recarga productos + categorías (para pull-to-refresh) */
  refresh:          () => Promise<void>;
}

/**
 * Hook headless para el catálogo POS.
 * - Carga productos + categorías al montar.
 * - Maneja búsqueda con useDeferredValue para no bloquear input.
 * - Filtra por categoría seleccionada y por término de búsqueda.
 */
export function useCatalog(): UseCatalogResult {
  const { show } = useToast();
  const mountedRef = useRef(true);

  const [products,    setProducts]    = useState<Product[]>([]);
  const [categories,  setCategories]  = useState<Category[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [selectedCat, setSelectedCat] = useState<number | null>(null);

  const deferredSearch = useDeferredValue(search);

  const loadProducts = useCallback(async () => {
    try {
      const data = await apiRequest("/products") as Product[];
      if (mountedRef.current) setProducts(data ?? []);
    } catch {
      if (mountedRef.current) show("Error cargando productos", { type: "error" });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [show]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await apiRequest("/categories") as Category[];
      if (mountedRef.current) setCategories(data ?? []);
    } catch {
      /* non-critical */
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadProducts(), loadCategories()]);
  }, [loadProducts, loadCategories]);

  useEffect(() => {
    mountedRef.current = true;
    void loadProducts();
    void loadCategories();
    return () => { mountedRef.current = false; };
  }, [loadProducts, loadCategories]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedCat !== null) list = list.filter(p => p.category_id === selectedCat);
    const q = deferredSearch.trim().toLowerCase();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    return list;
  }, [products, selectedCat, deferredSearch]);

  return {
    products,
    setProducts,
    categories,
    loading,
    search,
    setSearch,
    selectedCat,
    setSelectedCat,
    filteredProducts,
    refresh,
  };
}
