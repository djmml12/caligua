import db from "../config/db.js";

export const getUsersModel = async () => {
  const result = await db.query(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.role_id,
      r.name AS role_name,
      u.is_active,
      u.created_at
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    ORDER BY u.id ASC
  `);

  return result.rows;
};

export const getUserByIdModel = async (id) => {
  const result = await db.query(
    `SELECT
       u.id,
       u.name,
       u.email,
       u.role_id,
       r.name AS role_name,
       u.is_active,
       u.created_at
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.id = ?`,
    [id]
  );

  return result.rows[0];
};

export const findUserByEmail = async (email) => {
  const result = await db.query(
    `SELECT
       u.*,
       r.name AS role_name
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.email = ?`,
    [email]
  );

  return result.rows[0];
};

export const createUserModel = async (data) => {
  const result = await db.query(
    `INSERT INTO users (name, email, password, role_id, is_active)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [data.name, data.email, data.password, data.role_id, data.is_active ?? 1]
  );

  return getUserByIdModel(result.lastID);
};

export const updateUserModel = async (id, data) => {
  await db.query(
    `UPDATE users
     SET name      = ?,
         email     = ?,
         password  = ?,
         role_id   = ?,
         is_active = ?
     WHERE id = ?`,
    [data.name, data.email, data.password, data.role_id, data.is_active, id]
  );

  return getUserByIdModel(id);
};
