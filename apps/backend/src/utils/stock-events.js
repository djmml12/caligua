import db from "../config/db.js";

const clients = new Set();
let pendingTimer = null;
let pendingFullRefresh = false;
let pendingProductIds = new Set();

const EFFECTIVE_STOCK_SQL = `
  CASE
    WHEN COALESCE(p.tipo_stock, 'directo') = 'receta' THEN
      COALESCE((
        SELECT CAST(FLOOR(MIN(i.stock_actual / r.cantidad_por_porcion)) AS INTEGER)
        FROM recetas r
        JOIN insumos i ON i.id = r.insumo_id AND i.activo = 1
        WHERE r.producto_id = p.id AND r.cantidad_por_porcion > 0
      ), 0)
    ELSE p.stock
  END AS stock
`;

async function getStockSnapshot(productIds = null) {
  const params = [];
  let where = "p.is_active = 1";

  if (Array.isArray(productIds) && productIds.length > 0) {
    const ids = [...new Set(productIds.map(Number).filter(Number.isFinite))];
    if (ids.length > 0) {
      where += ` AND p.id IN (${ids.map(() => "?").join(",")})`;
      params.push(...ids);
    }
  }

  const result = await db.query(
    `SELECT p.id, ${EFFECTIVE_STOCK_SQL}
       FROM products p
      WHERE ${where}
      ORDER BY p.id ASC`,
    params
  );
  return result.rows ?? [];
}

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function flushStockUpdate() {
  pendingTimer = null;

  if (clients.size === 0) {
    pendingFullRefresh = false;
    pendingProductIds.clear();
    return;
  }

  const full = pendingFullRefresh;
  const ids = [...pendingProductIds];
  pendingFullRefresh = false;
  pendingProductIds.clear();

  try {
    const items = await getStockSnapshot(full ? null : ids);
    const payload = { full, items, at: Date.now() };
    for (const res of clients) {
      writeEvent(res, "stock:update", payload);
    }
  } catch (error) {
    console.error(`[stock-events] No se pudo emitir stock: ${error?.stack || error}`);
  }
}

export function notifyStockChanged({ productIds = [], full = false } = {}) {
  if (full) pendingFullRefresh = true;
  for (const id of productIds) {
    const productId = Number(id);
    if (Number.isFinite(productId)) pendingProductIds.add(productId);
  }

  if (!pendingTimer) {
    pendingTimer = setTimeout(() => { void flushStockUpdate(); }, 120);
    pendingTimer.unref?.();
  }
}

export async function handleStockEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  clients.add(res);
  writeEvent(res, "stock:connected", { at: Date.now() });

  try {
    const items = await getStockSnapshot();
    writeEvent(res, "stock:snapshot", { full: true, items, at: Date.now() });
  } catch (error) {
    writeEvent(res, "stock:error", { message: "No se pudo cargar el stock inicial" });
    console.error(`[stock-events] Stock inicial falló: ${error?.stack || error}`);
  }

  const heartbeat = setInterval(() => {
    try { writeEvent(res, "stock:heartbeat", { at: Date.now() }); } catch {}
  }, 25_000);
  heartbeat.unref?.();

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}
