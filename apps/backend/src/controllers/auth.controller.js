import db from "../config/db.js";
import bcrypt from "bcrypt";
import { generateToken } from "../utils/jwt.js";

const getRows = (result) => {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
};

export const login = async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const origin = req.headers.origin || req.headers.referer || "sin-origen";

  try {
    const identifier = String(req.body?.identifier ?? req.body?.email ?? "").trim();
    const password = String(req.body?.password ?? "");

    console.log(`[LOGIN] Intento | IP: ${ip} | Origen: ${origin} | Identificador: "${identifier}" | Body keys: ${Object.keys(req.body || {}).join(", ")}`);

    if (!identifier || !password) {
      console.log(`[LOGIN] Fallo 400 | IP: ${ip} | Campos vacíos`);
      return res.status(400).json({
        message: "Usuario y contraseña requeridos",
      });
    }

    const userResult = await db.query(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        u.password,
        u.role_id,
        r.name AS role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE LOWER(COALESCE(u.email, '')) = LOWER(?)
         OR LOWER(COALESCE(u.name, '')) = LOWER(?)
      `,
      [identifier, identifier]
    );

    const users = getRows(userResult);
    console.log(`[LOGIN] Búsqueda BD | IP: ${ip} | Identificador: "${identifier}" | Usuarios encontrados: ${users.length}`);

    if (users.length === 0) {
      console.log(`[LOGIN] Fallo 401 | IP: ${ip} | Usuario no encontrado: "${identifier}"`);
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);
    console.log(`[LOGIN] Contraseña válida: ${validPassword} | IP: ${ip} | Usuario: "${user.name}"`);

    if (!validPassword) {
      console.log(`[LOGIN] Fallo 401 | IP: ${ip} | Contraseña incorrecta para: "${user.name}"`);
      return res.status(401).json({ message: "Credenciales inválidas" });
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

    const permissions = getRows(permissionsResult).map((permission) => permission.name);

    const token = generateToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role_id: user.role_id,
      role_name: user.role_name,
      role: user.role_name,
      permissions,
    });

    console.log(`[LOGIN] Éxito | IP: ${ip} | Usuario: "${user.name}" | Rol: ${user.role_name}`);
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name,
        role: user.role_name,
        permissions,
      },
    });
  } catch (error) {
    console.error(`[LOGIN] Error 500 | IP: ${ip} | Error:`, error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
