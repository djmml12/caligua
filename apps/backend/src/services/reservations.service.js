import db from "../config/db.js";

export const createReservationService = async (userId, data) => {
  const { customer_name, phone, date, time, items, notes } = data;
  const total = (items ?? []).reduce((sum, i) => sum + Number(i.subtotal || 0), 0);

  const { rows } = await db.query(
    `INSERT INTO reservations (customer_name, phone, date, time, items, total, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [customer_name, phone ?? null, date, time ?? null, JSON.stringify(items ?? []), total, notes ?? null, userId ?? null]
  );
  return rows[0];
};

export const getReservationsService = async ({ date, status } = {}) => {
  const conditions = [];
  const params     = [];

  if (date) {
    params.push(date);
    conditions.push(`r.date = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`r.status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query(
    `SELECT r.*, u.name AS created_by_name
       FROM reservations r
       LEFT JOIN users u ON u.id = r.created_by
     ${where}
     ORDER BY r.date ASC, r.time ASC NULLS LAST, r.created_at ASC`,
    params
  );
  return rows.map((r) => ({ ...r, items: typeof r.items === "string" ? JSON.parse(r.items) : r.items }));
};

export const getReservationByIdService = async (id) => {
  const { rows } = await db.query(
    `SELECT r.*, u.name AS created_by_name
       FROM reservations r
       LEFT JOIN users u ON u.id = r.created_by
      WHERE r.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return { ...r, items: typeof r.items === "string" ? JSON.parse(r.items) : r.items };
};

export const updateReservationService = async (id, data) => {
  const { customer_name, phone, date, time, items, notes, status } = data;
  const total = items != null
    ? (items ?? []).reduce((sum, i) => sum + Number(i.subtotal || 0), 0)
    : undefined;

  const sets   = [];
  const params = [];

  const set = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

  if (customer_name !== undefined) set("customer_name", customer_name);
  if (phone         !== undefined) set("phone",         phone);
  if (date          !== undefined) set("date",          date);
  if (time          !== undefined) set("time",          time);
  if (items         !== undefined) { set("items", JSON.stringify(items)); set("total", total); }
  if (notes         !== undefined) set("notes",         notes);
  if (status        !== undefined) set("status",        status);

  if (!sets.length) return getReservationByIdService(id);

  params.push(id);
  const { rows } = await db.query(
    `UPDATE reservations SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return { ...r, items: typeof r.items === "string" ? JSON.parse(r.items) : r.items };
};

export const deleteReservationService = async (id) => {
  await db.query(`DELETE FROM reservations WHERE id = $1`, [id]);
};
