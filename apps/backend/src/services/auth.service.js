import bcrypt from "bcryptjs";
import db from "../config/db.js";
import { findUserByEmail } from "../models/user.model.js";
import { generateToken } from "../utils/jwt.js";

export const loginService = async (email, password) => {
  const user = await findUserByEmail(email);

  if (!user) {
    throw new Error("Usuario no existe");
  }

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    throw new Error("Credenciales incorrectas");
  }

  const permissionsResult = await db.query(
    `
    SELECT p.name
    FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = ?
    ORDER BY p.id
    `,
    [user.role_id]
  );

  const permissions = permissionsResult.rows.map((permission) => permission.name);

  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role_id: user.role_id,
    role_name: user.role_name,
    role: user.role_name,
    permissions,
  };

  const token = generateToken(payload);

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role_id: user.role_id,
      role: user.role_name,
      permissions,
    },
  };
};
