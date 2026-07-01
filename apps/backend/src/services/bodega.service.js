import db, { withTransaction } from "../config/db.js";
import { notifyStockChanged } from "../utils/stock-events.js";

const getRows  = (r) => (Array.isArray(r) ? r : (r?.rows ?? []));
const getFirst = (r) => getRows(r)[0] ?? null;

async function getRecipeProductIdsForInsumos(insumoIds = []) {
  const ids = [...new Set(insumoIds.map(Number).filter(Number.isFinite))];
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  const { rows } = await db.query(
    `SELECT DISTINCT producto_id FROM recetas WHERE insumo_id IN (${ph})`,
    ids
  );
  return (rows ?? []).map(r => Number(r.producto_id)).filter(Boolean);
}

function scheduleStockAlertEvaluation() {
  import("./email-alert.service.js")
    .then(({ processInventoryAlertsService }) => processInventoryAlertsService())
    .catch(err => console.error("[bodega] Error al evaluar alertas de stock:", err.message));
}

async function notifyRecipeStockChangedForInsumos(insumoIds = []) {
  await getRecipeProductIdsForInsumos(insumoIds);
  notifyStockChanged({ full: true });
  scheduleStockAlertEvaluation();
}

// ── Insumos ───────────────────────────────────────────────────────────────────

export async function getInsumosService() {
  const { rows } = await db.query(
    `SELECT id, nombre, unidad_base, stock_actual, stock_min, stock_critico,
            costo_unitario, activo, created_at
     FROM insumos
     ORDER BY nombre ASC`,
  );
  return rows;
}

export async function getInsumoByIdService(id) {
  return getFirst(await db.query(`SELECT * FROM insumos WHERE id = ?`, [id]));
}

export async function createInsumoService({ nombre, unidad_base = "pieza", stock_min = 0, stock_critico = 0 }) {
  if (!String(nombre ?? "").trim()) throw new Error("Nombre requerido");
  const r = await db.query(
    `INSERT INTO insumos (nombre, unidad_base, stock_min, stock_critico)
     VALUES (?, ?, ?, ?)
     RETURNING id`,
    [String(nombre).trim(), unidad_base, Number(stock_min), Number(stock_critico)],
  );
  return getInsumoByIdService(r.lastID);
}

export async function updateInsumoService(id, data) {
  const cur = await getInsumoByIdService(id);
  if (!cur) throw new Error("Insumo no encontrado");
  const nombre        = data.nombre        !== undefined ? String(data.nombre).trim()  : cur.nombre;
  const unidad_base   = data.unidad_base   !== undefined ? data.unidad_base            : cur.unidad_base;
  const stock_min     = data.stock_min     !== undefined ? Number(data.stock_min)       : cur.stock_min;
  const stock_critico = data.stock_critico !== undefined ? Number(data.stock_critico)   : cur.stock_critico;
  const activo        = data.activo        !== undefined ? (data.activo ? 1 : 0)        : cur.activo;
  await db.query(
    `UPDATE insumos SET nombre=?,unidad_base=?,stock_min=?,stock_critico=?,activo=? WHERE id=?`,
    [nombre, unidad_base, stock_min, stock_critico, activo, id],
  );
  await notifyRecipeStockChangedForInsumos([id]);
  return getInsumoByIdService(id);
}

export async function deleteInsumoService(id) {
  const { rows } = await db.query(`SELECT COUNT(*) AS c FROM recetas WHERE insumo_id = ?`, [id]);
  if (Number(rows[0]?.c) > 0) throw new Error("Este insumo está en uso en una receta. Elimínalo de la receta primero.");
  await db.query(`DELETE FROM insumos WHERE id = ?`, [id]);
  await notifyRecipeStockChangedForInsumos([id]);
}

// ── Compras / Entradas ────────────────────────────────────────────────────────

export async function registrarCompraService({ insumo_id, cantidad_compra, unidad_compra, factor_a_base, costo_total, notas }) {
  const insumo = await getInsumoByIdService(insumo_id);
  if (!insumo) throw new Error("Insumo no encontrado");

  const cantBase  = Number(cantidad_compra) * Number(factor_a_base);
  const costoUnit = cantBase > 0 ? Number(costo_total) / cantBase : 0;

  await withTransaction(async (client) => {
    const q = (sql, p) => db.queryClient(client, sql, p);

    const { rows: [cur] } = await q(`SELECT stock_actual, costo_unitario FROM insumos WHERE id = ?`, [insumo_id]);
    const stockAct  = Number(cur?.stock_actual  ?? 0);
    const costoAct  = Number(cur?.costo_unitario ?? 0);
    const totalBase = stockAct + cantBase;
    const nuevoCosto = totalBase > 0 ? (stockAct * costoAct + cantBase * costoUnit) / totalBase : 0;

    await q(
      `UPDATE insumos SET stock_actual = stock_actual + ?, costo_unitario = ? WHERE id = ?`,
      [cantBase, nuevoCosto, insumo_id],
    );

    const ins = await q(
      `INSERT INTO compras_insumo
         (insumo_id, cantidad_compra, unidad_compra, factor_a_base, cantidad_base, costo_total, costo_unitario, notas)
       VALUES (?,?,?,?,?,?,?,?)
       RETURNING id`,
      [insumo_id, Number(cantidad_compra), unidad_compra ?? "libra",
       Number(factor_a_base), cantBase, Number(costo_total), costoUnit, notas ?? null],
    );

    await q(
      `INSERT INTO movimientos_insumo (insumo_id, tipo, cantidad, referencia, notas)
       VALUES (?, 'compra', ?, ?, ?)`,
      [insumo_id, cantBase, `compra#${ins.lastID}`, notas ?? null],
    );
  });
  await notifyRecipeStockChangedForInsumos([insumo_id]);
  return getInsumoByIdService(insumo_id);
}

export async function getComprasService(insumo_id) {
  const { rows } = await db.query(
    `SELECT c.*, i.nombre AS insumo_nombre, i.unidad_base
     FROM compras_insumo c
     JOIN insumos i ON i.id = c.insumo_id
     ${insumo_id ? "WHERE c.insumo_id = ?" : ""}
     ORDER BY c.created_at DESC LIMIT 100`,
    insumo_id ? [Number(insumo_id)] : [],
  );
  return rows;
}

// ── Ajuste físico ─────────────────────────────────────────────────────────────

export async function ajustarStockService(insumo_id, nueva_cantidad, notas) {
  await withTransaction(async (client) => {
    const q = (sql, p) => db.queryClient(client, sql, p);
    const { rows: [cur] } = await q(`SELECT stock_actual FROM insumos WHERE id = ?`, [insumo_id]);
    if (!cur) throw new Error("Insumo no encontrado");
    const diferencia = Number(nueva_cantidad) - Number(cur.stock_actual);
    await q(`UPDATE insumos SET stock_actual = ? WHERE id = ?`, [Number(nueva_cantidad), insumo_id]);
    await q(
      `INSERT INTO movimientos_insumo (insumo_id, tipo, cantidad, notas) VALUES (?, 'ajuste', ?, ?)`,
      [insumo_id, diferencia, notas ?? `Conteo físico: ${nueva_cantidad}`],
    );
  });
  await notifyRecipeStockChangedForInsumos([insumo_id]);
  return getInsumoByIdService(insumo_id);
}

export async function getMovimientosService(insumo_id) {
  const { rows } = await db.query(
    `SELECT * FROM movimientos_insumo WHERE insumo_id = ? ORDER BY created_at DESC LIMIT 60`,
    [insumo_id],
  );
  return rows;
}

// ── Recetas ───────────────────────────────────────────────────────────────────

export async function getRecetaService(producto_id) {
  const { rows } = await db.query(
    `SELECT r.id, r.insumo_id, i.nombre AS insumo_nombre, i.unidad_base,
            i.stock_actual, i.costo_unitario, r.cantidad_por_porcion
     FROM recetas r
     JOIN insumos i ON i.id = r.insumo_id
     WHERE r.producto_id = ?`,
    [producto_id],
  );
  return rows;
}

export async function setRecetaService(producto_id, ingredientes) {
  await withTransaction(async (client) => {
    const q = (sql, p) => db.queryClient(client, sql, p);
    await q(`DELETE FROM recetas WHERE producto_id = ?`, [producto_id]);
    for (const ing of ingredientes) {
      if (Number(ing.cantidad_por_porcion) <= 0) continue;
      await q(
        `INSERT INTO recetas (producto_id, insumo_id, cantidad_por_porcion) VALUES (?,?,?)`,
        [producto_id, Number(ing.insumo_id), Number(ing.cantidad_por_porcion)],
      );
    }
    const tipo = ingredientes.length > 0 ? "receta" : "directo";
    await q(`UPDATE products SET tipo_stock = ? WHERE id = ?`, [tipo, producto_id]);
  });
  notifyStockChanged({ full: true });
  scheduleStockAlertEvaluation();
}

// ── Deducción al vender (llamada desde sales.service) ────────────────────────

export async function deductRecipeService(producto_id, cantidad, queryFn, sale_id) {
  const { rows: receta } = await queryFn(
    `SELECT insumo_id, cantidad_por_porcion FROM recetas WHERE producto_id = ?`,
    [producto_id],
  );
  for (const ing of receta) {
    const consumo = Number(ing.cantidad_por_porcion) * Number(cantidad);
    await queryFn(
      `UPDATE insumos SET stock_actual = stock_actual - ? WHERE id = ?`,
      [consumo, ing.insumo_id],
    );
    await queryFn(
      `INSERT INTO movimientos_insumo (insumo_id, tipo, cantidad, referencia)
       VALUES (?, 'venta', ?, ?)`,
      [ing.insumo_id, -consumo, sale_id ? `venta#${sale_id}` : null],
    );
  }
}

// ── Disponibilidad ────────────────────────────────────────────────────────────

export async function getProductosConTipoService() {
  const { rows } = await db.query(
    `SELECT p.id, p.name, p.price, p.stock,
            COALESCE(p.tipo_stock, 'directo') AS tipo_stock,
            p.is_active, p.category_id,
            c.name AS category_name,
            (SELECT COUNT(*) FROM recetas r WHERE r.producto_id = p.id) AS receta_count
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ORDER BY p.display_order ASC, p.name ASC`,
  );
  return rows;
}
