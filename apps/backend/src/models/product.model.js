import db from "../config/db.js";

export const createProduct = async ({
  name,
  stock,
  cost_price,
  price,
  category_id,
  is_active,
  display_order,
}) => {
  const result = await db.query(
    `INSERT INTO products (name, stock, cost_price, price, category_id, is_active, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [name, stock, cost_price, price, category_id, is_active, display_order]
  );

  const { rows } = await db.query(`SELECT * FROM products WHERE id = ?`, [result.lastID]);
  return rows[0];
};

export const updateProduct = async (id, data) => {
  const { name, stock, cost_price, price, category_id, is_active, display_order } = data;

  await db.query(
    `UPDATE products
     SET name          = ?,
         stock         = ?,
         cost_price    = ?,
         price         = ?,
         category_id   = ?,
         is_active     = ?,
         display_order = ?
     WHERE id = ?`,
    [name, stock, cost_price, price, category_id, is_active, display_order, id]
  );

  const { rows } = await db.query(`SELECT * FROM products WHERE id = ?`, [id]);
  return rows[0];
};
