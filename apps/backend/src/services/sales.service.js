import db, { withTransaction } from "../config/db.js";
import { processInventoryAlertsService } from "./email-alert.service.js";

// ── Result normalizers ────────────────────────────────────────────────────────

const getRows = (result) => {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
};

const getFirstRow = (result) => getRows(result)[0] || null;

// ── SQL fragments ─────────────────────────────────────────────────────────────

/** Next sequential number within the current calendar month */
const computeNextMonthlyNumber = async (qFn) => {
  const result = await qFn(
    `SELECT COALESCE(MAX(monthly_number), 0) + 1 AS next
       FROM sales
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
    []
  );
  return Number(getRows(result)[0]?.next ?? 1);
};

// ── Internal queries ──────────────────────────────────────────────────────────

const SALE_HEADER_SQL = `
  SELECT
    s.id,
    s.monthly_number,
    s.reference,
    s.total,
    s.status,
    s.created_at,
    COALESCE(s.tip_amount, 0)     AS tip_amount,
    COALESCE(s.tip_percentage, 0) AS tip_percentage,
    s.notes,
    u.name AS user_name
  FROM sales s
  JOIN users u ON u.id = s.user_id
  WHERE s.id = ?
`;

const selectSaleHeaderById = async (saleId, client = null) => {
  const result = client
    ? await db.queryClient(client, SALE_HEADER_SQL, [saleId])
    : await db.query(SALE_HEADER_SQL, [saleId]);

  return getFirstRow(result);
};

const selectSaleItemsById = async (saleId, client = null) => {
  const sql = `
    SELECT
      si.id,
      si.product_id,
      p.name,
      p.category_id,
      COALESCE(c.printer_target, 'kitchen') AS printer_target,
      si.quantity,
      si.price_at_sale,
      si.notes
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE si.sale_id = ?
  `;

  const result = client
    ? await db.queryClient(client, sql, [saleId])
    : await db.query(sql, [saleId]);

  return getRows(result);
};

// ── Public service functions ──────────────────────────────────────────────────

export async function createSaleService(userId, reference = null) {
  const monthlyNumber = await computeNextMonthlyNumber((s, p) => db.query(s, p));

  const result = await db.query(
    `INSERT INTO sales (user_id, total, status, reference, monthly_number)
     VALUES (?, 0, 'open', ?, ?)
     RETURNING id`,
    [userId, reference, monthlyNumber]
  );
  const newId = result.lastID;

  return {
    ...(newId ? await selectSaleHeaderById(newId) : {}),
    id: newId,
    monthly_number: monthlyNumber,
    user_id: userId,
    total: 0,
    status: "open",
    reference,
  };
}

export async function getOpenSalesService() {
  const result = await db.query(`
    SELECT id, monthly_number, reference, total, created_at
    FROM sales
    WHERE status = 'open'
    ORDER BY created_at DESC
  `);

  return getRows(result);
}

export async function getOpenSalesWithCountService() {
  const result = await db.query(`
    SELECT s.id, s.monthly_number, s.reference, s.total, s.created_at,
           CAST(COUNT(si.id) AS INTEGER) AS items_count
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE s.status = 'open'
    GROUP BY s.id, s.monthly_number, s.reference, s.total, s.created_at
    ORDER BY s.created_at DESC
  `);

  return getRows(result);
}

export async function createAndPaySaleService(userId, {
  items = [], order_id = null, reference = null,
  tip_amount = null, tip_percentage = null,
}) {
  if (!items.length) throw new Error("El carrito está vacío");

  return withTransaction(async (client) => {
    const queryFn = (sql, params) => db.queryClient(client, sql, params);

    let saleId = order_id ? Number(order_id) : null;

    if (saleId) {
      const check = await queryFn(`SELECT status FROM sales WHERE id = ?`, [saleId]);
      const row = getRows(check)[0];
      if (!row) throw new Error("Orden no encontrada");
      if (row.status !== "open") throw new Error("La orden ya fue procesada");
      if (reference) {
        await queryFn(`UPDATE sales SET reference = ? WHERE id = ?`, [reference, saleId]);
      }
    } else {
      const monthlyNumber = await computeNextMonthlyNumber(queryFn);
      const result = await queryFn(
        `INSERT INTO sales (user_id, total, status, reference, monthly_number)
         VALUES (?, 0, 'open', ?, ?)
         RETURNING id`,
        [userId, reference, monthlyNumber]
      );
      saleId = result.lastID;
    }

    await queryFn(`DELETE FROM sale_items WHERE sale_id = ?`, [saleId]);

    let total = 0;
    for (const item of items) {
      const qty = Number(item.quantity ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cantidad inválida");

      const productResult = await queryFn(
        `SELECT id, price, cost_price FROM products WHERE id = ? AND is_active = 1`,
        [item.product_id]
      );
      const product = getRows(productResult)[0];
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);

      const price    = Number(item.price ?? product.price);
      const cost     = Number(product.cost_price ?? 0);
      const subtotal = price * qty;
      total += subtotal;

      await queryFn(
        `INSERT INTO sale_items (sale_id, product_id, quantity, price_at_sale, cost_at_sale, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [saleId, item.product_id, qty, price, cost, subtotal]
      );

      await queryFn(`UPDATE products SET stock = stock - ? WHERE id = ?`, [qty, item.product_id]);
    }

    // When neither tip_amount nor tip_percentage is explicitly provided,
    // apply the percentage configured in settings (same logic as paySaleWithTipService).
    // When explicitly set (including 0 for "Cobrar sin propina"), use the provided values.
    let finalTipAmount, finalTipPercentage;
    if (tip_amount === null && tip_percentage === null) {
      const tipResult = await queryFn(`SELECT value FROM settings WHERE key = 'tip_percentage'`, []);
      const tipRows   = getRows(tipResult);
      finalTipPercentage = Number(tipRows[0]?.value || 0);
      finalTipAmount     = Number((total * (finalTipPercentage / 100)).toFixed(2));
    } else {
      finalTipAmount     = tip_amount     !== null ? Number(tip_amount)     : 0;
      finalTipPercentage = tip_percentage !== null ? Number(tip_percentage) : 0;
    }

    await queryFn(
      `UPDATE sales
          SET total          = ?,
              status         = 'paid',
              paid_by        = ?,
              paid_at        = NOW(),
              tip_amount     = ?,
              tip_percentage = ?
        WHERE id = ?`,
      [total, userId, finalTipAmount, finalTipPercentage, saleId]
    );

    return { id: saleId, total, tip_amount: finalTipAmount };
  });
}

export async function createOpenOrderService(userId, { items = [], reference = null, notes = null }) {
  return withTransaction(async (client) => {
    const queryFn = (sql, params) => db.queryClient(client, sql, params);

    const monthlyNumber = await computeNextMonthlyNumber(queryFn);
    const insertResult = await queryFn(
      `INSERT INTO sales (user_id, total, status, reference, notes, monthly_number)
       VALUES (?, 0, 'open', ?, ?, ?)
       RETURNING id`,
      [userId, reference, notes, monthlyNumber]
    );
    const saleId = insertResult.lastID;

    let total = 0;
    for (const item of items) {
      const qty = Number(item.quantity ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cantidad inválida");

      const productResult = await queryFn(
        `SELECT id, price, cost_price FROM products WHERE id = ?`,
        [item.product_id]
      );
      const product = getRows(productResult)[0];
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);

      const price    = Number(item.price ?? product.price);
      const cost     = Number(product.cost_price ?? 0);
      const subtotal = price * qty;
      total += subtotal;
      const itemNotes = item.notes ?? null;

      await queryFn(
        `INSERT INTO sale_items (sale_id, product_id, quantity, price_at_sale, cost_at_sale, subtotal, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [saleId, item.product_id, qty, price, cost, subtotal, itemNotes]
      );
    }

    await queryFn(`UPDATE sales SET total = ? WHERE id = ?`, [total, saleId]);

    return { id: saleId, monthly_number: monthlyNumber, reference, total, notes };
  });
}

export async function updateOpenOrderService(saleId, { items = [], reference, notes }) {
  return withTransaction(async (client) => {
    const queryFn = (sql, params) => db.queryClient(client, sql, params);

    const check = await queryFn(
      `SELECT status, reference, monthly_number FROM sales WHERE id = ?`,
      [saleId]
    );
    const row = getRows(check)[0];
    if (!row) throw new Error("Orden no encontrada");
    if (row.status !== "open") throw new Error("Solo se pueden modificar órdenes abiertas");

    const newRef   = reference !== undefined ? reference : row.reference;
    const newNotes = notes     !== undefined ? notes     : null;
    await queryFn(`UPDATE sales SET reference = ?, notes = ? WHERE id = ?`, [newRef, newNotes, saleId]);

    await queryFn(`DELETE FROM sale_items WHERE sale_id = ?`, [saleId]);

    let total = 0;
    for (const item of items) {
      const qty = Number(item.quantity ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cantidad inválida");

      const productResult = await queryFn(
        `SELECT id, price, cost_price FROM products WHERE id = ?`,
        [item.product_id]
      );
      const product = getRows(productResult)[0];
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);

      const price    = Number(item.price ?? product.price);
      const cost     = Number(product.cost_price ?? 0);
      const subtotal = price * qty;
      total += subtotal;
      const itemNotes = item.notes ?? null;

      await queryFn(
        `INSERT INTO sale_items (sale_id, product_id, quantity, price_at_sale, cost_at_sale, subtotal, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [saleId, item.product_id, qty, price, cost, subtotal, itemNotes]
      );
    }

    await queryFn(`UPDATE sales SET total = ? WHERE id = ?`, [total, saleId]);

    return { id: saleId, monthly_number: Number(row.monthly_number ?? 0), reference: newRef, total, notes: newNotes };
  });
}

export async function getSaleByIdService(saleId) {
  const sale = await selectSaleHeaderById(saleId);

  if (!sale) {
    throw new Error("Orden no encontrada");
  }

  const items = await selectSaleItemsById(saleId);

  return {
    ...sale,
    items: items.map((item) => ({
      id:       item.product_id,
      name:     item.name,
      price:    Number(item.price_at_sale),
      quantity: item.quantity,
      notes:    item.notes,
    })),
  };
}

export async function updateSaleService(saleId, items, notes) {
  const normalizedItems = Array.isArray(items) ? items : [];

  return withTransaction(async (client) => {
    const queryFn = (sql, params) =>
      client ? db.queryClient(client, sql, params) : db.query(sql, params);

    const saleCheck = await queryFn(`SELECT status FROM sales WHERE id = ?`, [saleId]);
    const saleRows  = getRows(saleCheck);

    if (saleRows.length === 0) throw new Error("Orden no encontrada");
    if (saleRows[0].status !== "open") throw new Error("Solo se pueden modificar órdenes abiertas");

    if (notes !== undefined) {
      await queryFn(`UPDATE sales SET notes = ? WHERE id = ?`, [notes, saleId]);
    }

    await queryFn(`DELETE FROM sale_items WHERE sale_id = ?`, [saleId]);

    let total = 0;

    for (const item of normalizedItems) {
      const quantity = Number(item?.quantity ?? 0);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Cantidad inválida");
      }

      const productQuery = await queryFn(
        `SELECT id, price, cost_price FROM products WHERE id = ?`,
        [item.product_id]
      );
      const productRows = getRows(productQuery);

      if (productRows.length === 0) throw new Error("Producto no encontrado");

      const product  = productRows[0];
      const price    = Number(product.price);
      const cost     = Number(product.cost_price);
      const subtotal = price * quantity;
      const itemNotes = item?.notes ?? null;

      total += subtotal;

      await queryFn(
        `INSERT INTO sale_items (sale_id, product_id, quantity, price_at_sale, cost_at_sale, subtotal, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [saleId, item.product_id, quantity, price, cost, subtotal, itemNotes]
      );
    }

    await queryFn(`UPDATE sales SET total = ? WHERE id = ?`, [total, saleId]);

    return { id: saleId, total };
  });
}

async function processSaleItems(saleId, queryFn) {
  const items = await selectSaleItemsById(saleId);

  if (items.length === 0) {
    throw new Error("La orden no tiene productos");
  }

  let total = 0;

  for (const item of items) {
    const stockQuery = await queryFn(`SELECT stock FROM products WHERE id = ?`, [item.product_id]);
    const stockRows  = getRows(stockQuery);

    if (stockRows.length === 0) throw new Error("Producto no encontrado");

    const subtotal = Number(item.price_at_sale) * Number(item.quantity);
    total += subtotal;

    await queryFn(`UPDATE products SET stock = stock - ? WHERE id = ?`, [item.quantity, item.product_id]);
  }

  return total;
}

export async function paySaleService(saleId, userId) {
  return withTransaction(async (client) => {
    const queryFn = (sql, params) =>
      client ? db.queryClient(client, sql, params) : db.query(sql, params);

    const saleQuery = await queryFn(`SELECT status, total FROM sales WHERE id = ?`, [saleId]);
    const saleRows  = getRows(saleQuery);

    if (saleRows.length === 0) throw new Error("Orden no encontrada");

    let total = Number(saleRows[0].total || 0);

    if (saleRows[0].status === "open") {
      total = await processSaleItems(saleId, queryFn);
    }

    await queryFn(
      `UPDATE sales
          SET total          = ?,
              status         = 'paid',
              paid_by        = ?,
              paid_at        = NOW(),
              tip_amount     = 0,
              tip_percentage = 0
        WHERE id = ?`,
      [total, userId, saleId]
    );

    await processInventoryAlertsService();

    const updatedSale = await getSaleByIdService(saleId);
    return { ...updatedSale, total_with_tip: total };
  });
}

export async function paySaleWithTipService(saleId, userId) {
  return withTransaction(async (client) => {
    const queryFn = (sql, params) =>
      client ? db.queryClient(client, sql, params) : db.query(sql, params);

    const saleQuery = await queryFn(`SELECT status, total FROM sales WHERE id = ?`, [saleId]);
    const saleRows  = getRows(saleQuery);

    if (saleRows.length === 0) throw new Error("Orden no encontrada");

    let total = Number(saleRows[0].total || 0);

    if (saleRows[0].status === "open") {
      total = await processSaleItems(saleId, queryFn);
    }

    const tipResult = await queryFn(`SELECT value FROM settings WHERE key = 'tip_percentage'`, []);
    const tipRows   = getRows(tipResult);
    const tipPercentage = Number(tipRows[0]?.value || 0);
    const tipAmount     = Number((total * (tipPercentage / 100)).toFixed(2));

    await queryFn(
      `UPDATE sales
          SET total          = ?,
              status         = 'paid',
              paid_by        = ?,
              paid_at        = NOW(),
              tip_amount     = ?,
              tip_percentage = ?
        WHERE id = ?`,
      [total, userId, tipAmount, tipPercentage, saleId]
    );

    await processInventoryAlertsService();

    const updatedSale = await getSaleByIdService(saleId);
    return { ...updatedSale, total_with_tip: total + tipAmount };
  });
}

export async function getPaidSalesTodayService(date = null) {
  const d = date || new Date().toISOString().slice(0, 10);
  const result = await db.query(
    `SELECT
       s.id,
       s.monthly_number,
       s.reference,
       ROUND(CAST(s.total AS NUMERIC), 2)               AS total,
       ROUND(CAST(COALESCE(s.tip_amount, 0) AS NUMERIC), 2) AS tip_amount,
       s.paid_at,
       s.created_at,
       u.name AS user_name
     FROM sales s
     JOIN users u ON u.id = s.user_id
     WHERE s.status = 'paid'
       AND CAST(COALESCE(s.paid_at, s.created_at) AS DATE) = CAST(? AS DATE)
     ORDER BY COALESCE(s.paid_at, s.created_at) DESC`,
    [d]
  );
  return getRows(result);
}

export async function cancelSaleService(saleId, userId) {
  const result = await db.query(
    `UPDATE sales
        SET status      = 'canceled',
            canceled_at = NOW(),
            canceled_by = ?
      WHERE id     = ?
        AND status  = 'open'`,
    [userId, saleId]
  );

  if ((result?.rowCount ?? 0) === 0) {
    throw new Error("La orden no existe o ya fue procesada");
  }

  const updatedSale = await getSaleByIdService(saleId);
  return { ...updatedSale, success: true };
}
