import db from "../config/db.js";

const CATEGORY_SELECT = `
  SELECT c.*, parent.name AS parent_name
  FROM categories c
  LEFT JOIN categories parent ON parent.id = c.parent_id
`;

const ORDER_CLAUSE = `
  ORDER BY COALESCE(parent.display_order, c.display_order),
           CASE WHEN c.parent_id IS NOT NULL THEN 1 ELSE 0 END,
           c.display_order,
           c.id
`;

export const getCategories = async (includeInactive = false) => {
  if (includeInactive) {
    const { rows } = await db.query(`${CATEGORY_SELECT} ${ORDER_CLAUSE}`);
    return rows;
  }

  const { rows } = await db.query(
    `${CATEGORY_SELECT} WHERE c.is_active = 1 ${ORDER_CLAUSE}`
  );

  return rows;
};

export const createCategory = async ({ name, parent_id = null, printer_target = 'kitchen' }) => {
  const orderSql = parent_id === null
    ? `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM categories WHERE parent_id IS NULL`
    : `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM categories WHERE parent_id = ?`;
  const orderParams = parent_id === null ? [] : [parent_id];
  const orderRow = await db.query(orderSql, orderParams);
  const nextOrder = Number(orderRow.rows?.[0]?.next_order ?? 0);

  const target = printer_target === 'bar' ? 'bar' : 'kitchen';
  const result = await db.query(
    `INSERT INTO categories (name, parent_id, display_order, printer_target) VALUES (?, ?, ?, ?) RETURNING id`,
    [name, parent_id, nextOrder, target]
  );
  const newId = result.lastID;

  const { rows } = await db.query(`${CATEGORY_SELECT} WHERE c.id = ?`, [newId]);

  return {
    ...(rows[0] || {}),
    id: newId,
  };
};

export const updateCategory = async (id, { name, printer_target }) => {
  const target = printer_target === 'bar' ? 'bar' : printer_target === 'kitchen' ? 'kitchen' : null;
  await db.query(
    `UPDATE categories SET name = COALESCE(?, name), printer_target = COALESCE(?, printer_target) WHERE id = ?`,
    [name ?? null, target, id]
  );

  const { rows } = await db.query(`${CATEGORY_SELECT} WHERE c.id = ?`, [id]);
  return rows[0];
};

export const bulkUpdatePrinterTargets = async (targets) => {
  for (const { id, printer_target } of targets) {
    const target = printer_target === 'bar' ? 'bar' : 'kitchen';
    await db.query(
      `UPDATE categories SET printer_target = ? WHERE id = ?`,
      [target, Number(id)]
    );
  }
  return { success: true };
};

export const deactivateCategory = async (id) => {
  await db.query(`UPDATE categories SET is_active = 0 WHERE id = ?`, [id]);

  const { rows } = await db.query(`${CATEGORY_SELECT} WHERE c.id = ?`, [id]);
  return rows[0];
};

export const deleteCategory = async (id) => {
  const check = await db.query(
    `SELECT COUNT(*) AS count FROM products WHERE category_id = ?`,
    [id]
  );

  if (Number(check.rows[0].count) > 0) {
    throw new Error("No se puede eliminar categoría con productos asociados");
  }

  const subcategories = await db.query(
    `SELECT COUNT(*) AS count FROM categories WHERE parent_id = ?`,
    [id]
  );

  if (Number(subcategories.rows[0].count) > 0) {
    throw new Error("No se puede eliminar categoría con subcategorías asociadas");
  }

  await db.query(`DELETE FROM categories WHERE id = ?`, [id]);
  return { success: true };
};

export const activateCategory = async (id) => {
  await db.query(`UPDATE categories SET is_active = 1 WHERE id = ?`, [id]);

  const { rows } = await db.query(`${CATEGORY_SELECT} WHERE c.id = ?`, [id]);
  return rows[0];
};

export const reorderCategories = async (categories) => {
  for (let index = 0; index < categories.length; index += 1) {
    const item = categories[index];
    const id = typeof item === "object" ? Number(item.id) : Number(item);
    if (!Number.isFinite(id)) continue;

    await db.query(
      `UPDATE categories SET display_order = ? WHERE id = ?`,
      [index, id]
    );
  }

  return { success: true };
};
