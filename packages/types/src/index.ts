/* ── Auth ─────────────────────────────────────────────────── */

export type AuthUser = {
  id:           number;
  name:         string;
  email:        string;
  role?:        string;
  role_name?:   string;
  role_id?:     number;
  permissions?: string[];
};

/* ── Catálogo ─────────────────────────────────────────────── */

export interface Product {
  id:           number;
  name:         string;
  price:        number | string;
  stock?:       number | null;
  category_id?: number | null;
}

export interface Category {
  id:   number;
  name: string;
}

/* ── Ticket / carrito ─────────────────────────────────────── */

export interface CartItem {
  productId: number;
  name:      string;
  price:     number;
  quantity:  number;
  notes?:    string;
}

/* ── Órdenes guardadas ────────────────────────────────────── */

export interface SavedOrder {
  id:              number;
  monthly_number?: number;
  reference:       string;
  total:           number | string;
  items_count?:    number;
  created_at:      string;
}
