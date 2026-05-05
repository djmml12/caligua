import bcrypt from "bcrypt";
import db from "../config/db.js";
import { initDB } from "../config/db.init.js";

const createAdmin = async () => {
  try {
    await initDB();

    const hash = await bcrypt.hash("admin123", 10);

    const roleResult = await db.query(`SELECT id FROM roles WHERE name = ?`, ["admin"]);
    const roleId = roleResult.rows[0]?.id ?? 1;

    await db.query(
      `INSERT INTO users (name, email, password, role_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (email) DO NOTHING`,
      ["Administrador", "admin@pos.com", hash, roleId]
    );

    console.log("✅ Usuario admin creado");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creando admin:", error);
    process.exit(1);
  }
};

createAdmin();
