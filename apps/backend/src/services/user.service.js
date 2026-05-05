import bcrypt from "bcrypt";
import db from "../config/db.js";
import {
  getUsersModel,
  getUserByIdModel,
  createUserModel,
  updateUserModel,
  findUserByEmail,
} from "../models/user.model.js";

export const getUsersService = async () => getUsersModel();

const resolveRoleId = async (role, fallback = null) => {
  if (role === undefined || role === null || role === "") {
    return fallback;
  }

  if (Number.isFinite(Number(role))) {
    return Number(role);
  }

  const roleResult = await db.query(`SELECT id FROM roles WHERE name = ?`, [role]);

  if (!roleResult.rows.length) {
    throw new Error("Rol inválido");
  }

  return roleResult.rows[0].id;
};

export const createUserService = async (data) => {
  const name = String(data?.name ?? "").trim();
  const email = String(data?.email ?? "").trim().toLowerCase();
  const password = String(data?.password ?? "");
  const role = data?.role ?? data?.role_id;

  if (!name || !email || !password || role === undefined) {
    throw new Error("Datos incompletos");
  }

  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    throw new Error("El email ya existe");
  }

  const role_id = await resolveRoleId(role);
  const hashedPassword = await bcrypt.hash(password, 10);

  return createUserModel({
    name,
    email,
    password: hashedPassword,
    role_id,
    is_active: data?.is_active === undefined ? 1 : data.is_active ? 1 : 0,
  });
};

export const updateUserService = async (id, data) => {
  const numericId = Number(id);
  const existingUser = await getUserByIdModel(numericId);

  if (!existingUser) {
    throw new Error("Usuario no encontrado");
  }

  const email = data?.email !== undefined ? String(data.email).trim().toLowerCase() : existingUser.email;

  if (email !== existingUser.email) {
    const userWithSameEmail = await findUserByEmail(email);
    if (userWithSameEmail && Number(userWithSameEmail.id) !== numericId) {
      throw new Error("El email ya existe");
    }
  }

  const role_id = await resolveRoleId(data?.role ?? data?.role_id, existingUser.role_id);

  let password = null;

  if (data?.password) {
    password = await bcrypt.hash(String(data.password), 10);
  } else {
    const fullUser = await db.query(`SELECT password FROM users WHERE id = ?`, [numericId]);
    password = fullUser.rows[0]?.password;
  }

  return updateUserModel(numericId, {
    name: data?.name !== undefined ? String(data.name).trim() : existingUser.name,
    email,
    password,
    role_id,
    is_active: data?.is_active === undefined ? existingUser.is_active : data.is_active ? 1 : 0,
  });
};

export const deleteUserService = async (id) => {
  await db.query(`DELETE FROM users WHERE id = ?`, [id]);
  return { success: true };
};
