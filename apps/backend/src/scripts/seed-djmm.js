/**
 * Seed script: usuario djmm + 20 productos + ventas simuladas mayo 2026.
 * Ejecutar desde la raíz del monorepo:
 *   node apps/backend/src/scripts/seed-djmm.js
 */

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import bcrypt from "bcrypt";
import pg from "pg";

// ── Carga .env del backend ───────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env") });

const pool = new pg.Pool({
  host:     process.env.PG_HOST     || "localhost",
  port:     Number(process.env.PG_PORT) || 5432,
  user:     process.env.PG_USER     || "postgres",
  password: process.env.PG_PASSWORD || "",
  database: process.env.PG_DATABASE || "pos",
});

// ? → $1, $2, … (igual que db.js)
function sql(text, params = []) {
  let i = 0;
  const pgSql = text.replace(/\?/g, () => `$${++i}`);
  return pool.query(pgSql, params);
}

// número aleatorio entero [min, max]
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick  = (arr) => arr[rand(0, arr.length - 1)];

// ── 1. USUARIO djmm ──────────────────────────────────────────────────────────
async function seedUser() {
  const { rows: roleRows } = await sql(
    `SELECT id FROM roles WHERE name = ?`, ["admin"]
  );
  const roleId = roleRows[0]?.id ?? 1;

  const hash = await bcrypt.hash("admin", 10);

  const { rows } = await sql(
    `INSERT INTO users (name, email, password, role_id, is_active)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           password = EXCLUDED.password,
           role_id  = EXCLUDED.role_id
     RETURNING id, name, email`,
    ["djmm", "djmm@pos.com", hash, roleId]
  );
  console.log(`👤 Usuario: ${rows[0].name} <${rows[0].email}> id=${rows[0].id}`);
  return rows[0].id;
}

// ── 2. CATEGORÍAS ────────────────────────────────────────────────────────────
const CATEGORIES = [
  { name: "Cafés y Bebidas Calientes" },
  { name: "Bebidas Frías" },
  { name: "Alimentos" },
  { name: "Postres" },
];

async function seedCategories() {
  const ids = {};
  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const { rows } = await sql(
      `INSERT INTO categories (name, is_active, display_order)
       VALUES (?, 1, ?)
       ON CONFLICT (name) DO UPDATE SET display_order = EXCLUDED.display_order
       RETURNING id`,
      [cat.name, i + 1]
    );
    ids[cat.name] = rows[0].id;
  }
  console.log(`📂 Categorías: ${Object.keys(ids).join(", ")}`);
  return ids;
}

// ── 3. PRODUCTOS (20) ────────────────────────────────────────────────────────
function buildProducts(catIds) {
  return [
    // Cafés y Bebidas Calientes (6)
    { name: "Café Americano",      price: 2500,  cost: 800,  cat: "Cafés y Bebidas Calientes" },
    { name: "Cappuccino",          price: 3200,  cost: 1100, cat: "Cafés y Bebidas Calientes" },
    { name: "Latte",               price: 3500,  cost: 1200, cat: "Cafés y Bebidas Calientes" },
    { name: "Espresso Doble",      price: 2800,  cost: 900,  cat: "Cafés y Bebidas Calientes" },
    { name: "Café con Leche",      price: 2600,  cost: 850,  cat: "Cafés y Bebidas Calientes" },
    { name: "Té Negro",            price: 2000,  cost: 400,  cat: "Cafés y Bebidas Calientes" },
    // Bebidas Frías (5)
    { name: "Frappé de Café",      price: 4500,  cost: 1500, cat: "Bebidas Frías" },
    { name: "Limonada Natural",    price: 3000,  cost: 700,  cat: "Bebidas Frías" },
    { name: "Smoothie de Fresa",   price: 4000,  cost: 1300, cat: "Bebidas Frías" },
    { name: "Agua de Jamaica",     price: 2200,  cost: 500,  cat: "Bebidas Frías" },
    { name: "Jugo de Naranja",     price: 3500,  cost: 900,  cat: "Bebidas Frías" },
    // Alimentos (5)
    { name: "Croissant de Jamón",  price: 5500,  cost: 2200, cat: "Alimentos" },
    { name: "Sandwich Club",       price: 7000,  cost: 2800, cat: "Alimentos" },
    { name: "Tostadas con Queso",  price: 4000,  cost: 1500, cat: "Alimentos" },
    { name: "Bowl de Granola",     price: 5000,  cost: 1800, cat: "Alimentos" },
    { name: "Wrap Vegetal",        price: 6500,  cost: 2500, cat: "Alimentos" },
    // Postres (4)
    { name: "Brownie de Chocolate",price: 3500,  cost: 1200, cat: "Postres" },
    { name: "Cheesecake de Frutos",price: 4500,  cost: 1600, cat: "Postres" },
    { name: "Muffin de Arándano",  price: 3000,  cost: 900,  cat: "Postres" },
    { name: "Cookie de Chocochips",price: 2500,  cost: 700,  cat: "Postres" },
  ].map((p) => ({ ...p, category_id: catIds[p.cat] }));
}

async function seedProducts(catIds) {
  const products = buildProducts(catIds);
  const result = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const { rows } = await sql(
      `INSERT INTO products (name, price, cost_price, category_id, stock, is_active, display_order)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT DO NOTHING
       RETURNING id, name, price, cost_price`,
      [p.name, p.price, p.cost, p.category_id, rand(20, 100), i + 1]
    );
    if (rows.length) {
      result.push(rows[0]);
    } else {
      // ya existía — recuperar
      const { rows: ex } = await sql(
        `SELECT id, name, price, cost_price FROM products WHERE name = ?`, [p.name]
      );
      if (ex.length) result.push(ex[0]);
    }
  }
  console.log(`📦 Productos cargados: ${result.length}`);
  return result;
}

// ── 4. VENTAS MAYO 2026 ───────────────────────────────────────────────────────
async function seedSalesMay(userId, products) {
  // Verifica si ya hay ventas en mayo 2026 para este usuario
  const { rows: existing } = await sql(
    `SELECT COUNT(*) AS n FROM sales
      WHERE user_id = ?
        AND created_at >= '2026-05-01'
        AND created_at <  '2026-06-01'`,
    [userId]
  );
  if (Number(existing[0].n) > 0) {
    console.log(`⚠️  Ya existen ${existing[0].n} ventas en mayo 2026 para djmm — omitiendo.`);
    return;
  }

  // Obtiene el máximo monthly_number existente para mayo 2026
  const { rows: mnRows } = await sql(
    `SELECT COALESCE(MAX(monthly_number), 0) AS mx FROM sales
      WHERE created_at >= '2026-05-01' AND created_at < '2026-06-01'`
  );
  let monthlyNum = Number(mnRows[0].mx);

  let totalSales = 0;
  let totalRevenue = 0;

  for (let day = 1; day <= 31; day++) {
    const dateStr = `2026-05-${String(day).padStart(2, "0")}`;
    // fin de semana → más tráfico
    const dow = new Date(`${dateStr}T12:00:00`).getDay(); // 0=dom, 6=sáb
    const isWeekend = dow === 0 || dow === 6;
    const salesCount = isWeekend ? rand(6, 10) : rand(3, 7);

    for (let s = 0; s < salesCount; s++) {
      // Hora aleatoria entre 7:00 y 20:00
      const hour   = rand(7, 19);
      const minute = rand(0, 59);
      const ts     = `${dateStr}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00`;

      // Selecciona 1–4 productos distintos para esta venta
      const itemCount = rand(1, 4);
      const shuffled  = [...products].sort(() => Math.random() - 0.5).slice(0, itemCount);

      // Calcula total de la venta
      const items = shuffled.map((p) => ({
        product_id:    p.id,
        quantity:      rand(1, 3),
        price_at_sale: Number(p.price),
        cost_at_sale:  Number(p.cost_price),
      }));
      items.forEach((it) => { it.subtotal = it.price_at_sale * it.quantity; });
      const total = items.reduce((acc, it) => acc + it.subtotal, 0);

      monthlyNum++;

      // Inserta venta
      const { rows: saleRows } = await sql(
        `INSERT INTO sales
           (user_id, total, status, paid_by, paid_at, created_at, monthly_number)
         VALUES (?, ?, 'paid', ?, ?, ?, ?)
         RETURNING id`,
        [userId, total, userId, ts, ts, monthlyNum]
      );
      const saleId = saleRows[0].id;

      // Inserta ítems
      for (const it of items) {
        await sql(
          `INSERT INTO sale_items
             (sale_id, product_id, quantity, price_at_sale, cost_at_sale, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [saleId, it.product_id, it.quantity, it.price_at_sale, it.cost_at_sale, it.subtotal]
        );
      }

      totalSales++;
      totalRevenue += total;
    }
  }

  const fmt = (n) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  console.log(`🧾 Ventas mayo 2026: ${totalSales} transacciones`);
  console.log(`💰 Ingresos totales: ${fmt(totalRevenue)}`);
  console.log(`📊 Promedio diario:  ${fmt(totalRevenue / 31)}`);
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    console.log("🚀 Iniciando seed...\n");
    const userId  = await seedUser();
    const catIds  = await seedCategories();
    const products = await seedProducts(catIds);
    await seedSalesMay(userId, products);
    console.log("\n✅ Seed completado.");
  } catch (err) {
    console.error("❌ Error en seed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
