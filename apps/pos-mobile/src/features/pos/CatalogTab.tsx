import type { Product, Category } from "@pos/types";
import { fmt, toNum } from "@pos/pos-core";
import { Spinner } from "@pos/ui-kit";
import "./catalog-tab.css";

interface CatalogTabProps {
  filteredProducts: Product[];
  categories:       Category[];
  loading:          boolean;
  search:           string;
  setSearch:        (v: string) => void;
  selectedCat:      number | null;
  setSelectedCat:   (id: number | null) => void;
  onAdd:            (product: Product) => void;
  flashId:          number | null;
}

export default function CatalogTab({
  filteredProducts,
  categories,
  loading,
  search,
  setSearch,
  selectedCat,
  setSelectedCat,
  onAdd,
  flashId,
}: CatalogTabProps) {
  return (
    <div className="ct-root">
      <div className="ct-search">
        <input
          className="ct-search-input"
          type="search"
          placeholder="Buscar producto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="ct-cats" role="toolbar" aria-label="Categorías">
        <button
          className={`ct-chip${selectedCat === null ? " ct-chip--active" : ""}`}
          onClick={() => setSelectedCat(null)}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`ct-chip${selectedCat === cat.id ? " ct-chip--active" : ""}`}
            onClick={() => setSelectedCat(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ct-center">
          <Spinner size="md" />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="ct-center">
          <p className="ct-empty-text">Sin productos</p>
        </div>
      ) : (
        <div className="ct-grid">
          {filteredProducts.map((p) => (
            <button
              key={p.id}
              className={`ct-card${flashId === p.id ? " ct-card--flash" : ""}`}
              onClick={() => onAdd(p)}
            >
              <span className="ct-card-name">{p.name}</span>
              <span className="ct-card-price">{fmt(toNum(p.price))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
