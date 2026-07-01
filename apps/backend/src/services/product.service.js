import db from "../config/db.js";
import { syncProductAlertStateService } from "./email-alert.service.js";

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toNullableInt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toBoolInt = (value, fallback = 1) => {
  if (value === undefined || value === null || value === "") {
    return fallback ? 1 : 0;
  }
  return value ? 1 : 0;
};

const getRows = (result) => {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
};

const getFirstRow = (result) => getRows(result)[0] || null;

const selectProductById = async (id) => {
  const result = await db.query(
    `SELECT
       p.id,
       p.name,
       p.price,
       p.cost_price,
       p.stock,
       p.category_id,
       p.is_active,
       p.display_order,
       COALESCE(p.tipo_stock, 'directo') AS tipo_stock,
       c.name      AS category_name,
       parent.name AS parent_category_name
     FROM products p
     LEFT JOIN categories c      ON c.id      = p.category_id
     LEFT JOIN categories parent ON parent.id = c.parent_id
     WHERE p.id = ?`,
    [id]
  );

  return getFirstRow(result);
};

export const getProductsService = async (filtersOrCategoryId = {}, includeInactiveLegacy = false) => {
  let category_id = null;
  let includeInactive = false;

  if (typeof filtersOrCategoryId === "object" && filtersOrCategoryId !== null && !Array.isArray(filtersOrCategoryId)) {
    category_id     = filtersOrCategoryId.category_id;
    includeInactive = Boolean(filtersOrCategoryId.includeInactive);
  } else {
    category_id     = filtersOrCategoryId;
    includeInactive = Boolean(includeInactiveLegacy);
  }

  let sql = `
    SELECT
      p.id,
      p.name,
      p.price,
      p.cost_price,
      CASE
        WHEN COALESCE(p.tipo_stock, 'directo') = 'receta' THEN
          COALESCE((
            SELECT CAST(FLOOR(MIN(i.stock_actual / r.cantidad_por_porcion)) AS INTEGER)
            FROM recetas r
            JOIN insumos i ON i.id = r.insumo_id AND i.activo = 1
            WHERE r.producto_id = p.id AND r.cantidad_por_porcion > 0
          ), 0)
        ELSE p.stock
      END AS stock,
      COALESCE(p.tipo_stock, 'directo') AS tipo_stock,
      p.category_id,
      p.is_active,
      p.display_order,
      c.name      AS category_name,
      parent.name AS parent_category_name
    FROM products p
    LEFT JOIN categories c      ON c.id      = p.category_id
    LEFT JOIN categories parent ON parent.id = c.parent_id
  `;

  const params = [];
  const where  = [];

  if (category_id !== undefined && category_id !== null && category_id !== "") {
    where.push("p.category_id = ?");
    params.push(Number(category_id));
  }

  if (!includeInactive) {
    where.push("p.is_active = 1");
  }

  if (where.length > 0) {
    sql += ` WHERE ${where.join(" AND ")}`;
  }

  sql += ` ORDER BY p.display_order ASC, p.id ASC`;

  const result = await db.query(sql, params);
  return getRows(result);
};

export const getProductByIdService = async (id) => selectProductById(id);

export const createProductService = async (data) => {
  const name          = String(data?.name ?? "").trim();
  const price         = toNumber(data?.price, 0);
  const stock         = toNumber(data?.stock, 0);
  const cost_price    = toNumber(data?.cost_price, 0);
  const category_id   = toNullableInt(data?.category_id);
  const is_active     = toBoolInt(data?.is_active, 1);
  const display_order = toNumber(data?.display_order, 0);
  const tipo_stock    = ["receta", "directo"].includes(String(data?.tipo_stock ?? ""))
    ? String(data.tipo_stock)
    : "directo";

  if (!name) throw new Error("Nombre requerido");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Precio inválido");

  const result = await db.query(
    `INSERT INTO products (name, price, cost_price, stock, category_id, is_active, display_order, tipo_stock)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [name, price, cost_price, stock, category_id, is_active, display_order, tipo_stock]
  );
  const newId = result.lastID;

  if (!newId) throw new Error("No se pudo obtener el ID del producto creado");

  return selectProductById(newId);
};

export const updateProductService = async (id, data) => {
  const existing = await selectProductById(id);

  if (!existing) throw new Error("Producto no encontrado");

  const name          = data?.name !== undefined && data?.name !== null ? String(data.name).trim() : existing.name;
  const price         = data?.price !== undefined && data?.price !== null && data?.price !== "" ? toNumber(data.price, existing.price) : toNumber(existing.price, 0);
  const cost_price    = data?.cost_price !== undefined && data?.cost_price !== null && data?.cost_price !== "" ? toNumber(data.cost_price, existing.cost_price) : toNumber(existing.cost_price, 0);
  const stock         = data?.stock !== undefined && data?.stock !== null && data?.stock !== "" ? toNumber(data.stock, existing.stock) : toNumber(existing.stock, 0);
  const category_id   = data?.category_id !== undefined ? toNullableInt(data.category_id) : existing.category_id;
  const is_active     = data?.is_active !== undefined ? toBoolInt(data.is_active, existing.is_active ? 1 : 0) : existing.is_active ? 1 : 0;
  const display_order = data?.display_order !== undefined && data?.display_order !== null && data?.display_order !== "" ? toNumber(data.display_order, existing.display_order ?? 0) : toNumber(existing.display_order ?? 0, 0);
  const tipo_stock    = data?.tipo_stock !== undefined
    ? (["receta", "directo"].includes(String(data.tipo_stock)) ? String(data.tipo_stock) : existing.tipo_stock ?? "directo")
    : existing.tipo_stock ?? "directo";

  await db.query(
    `UPDATE products
        SET name          = ?,
            price         = ?,
            cost_price    = ?,
            stock         = ?,
            category_id   = ?,
            is_active     = ?,
            display_order = ?,
            tipo_stock    = ?
      WHERE id = ?`,
    [name, price, cost_price, stock, category_id, is_active, display_order, tipo_stock, id]
  );

  const updated = await selectProductById(id);
  await syncProductAlertStateService(updated);
  return updated;
};

export const deactivateProductService = async (id) => {
  await db.query(`UPDATE products SET is_active = 0 WHERE id = ?`, [id]);
  return selectProductById(id);
};

export const activateProductService = async (id) => {
  await db.query(`UPDATE products SET is_active = 1 WHERE id = ?`, [id]);
  return selectProductById(id);
};

export const deleteProductService = async (id) => {
  const existing = await selectProductById(id);

  if (!existing) throw new Error("Producto no encontrado");

  await db.query(`DELETE FROM products WHERE id = ?`, [id]);
  return { success: true };
};

export const reorderProductsService = async (products = []) => {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("Lista de productos requerida");
  }

  for (let index = 0; index < products.length; index++) {
    const item      = products[index];
    const productId = typeof item === "object" ? Number(item.id ?? item.product_id) : Number(item);

    if (!Number.isFinite(productId)) continue;

    const displayOrder = typeof item === "object" && Number.isFinite(Number(item.order))
      ? Number(item.order)
      : index + 1;

    await db.query(`UPDATE products SET display_order = ? WHERE id = ?`, [displayOrder, productId]);
  }

  return { success: true };
};
