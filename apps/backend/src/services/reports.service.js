import db from "../config/db.js";

const STOCK_ALERT_THRESHOLDS_KEY = "stock_alert_thresholds";

const defaultStockThresholds = {
  lowStock: 15,
  criticalStock: 5,
};

const normalizeDate = (value) => String(value ?? "").split(" ")[0];

const normalizeStockThresholds = (value = {}) => {
  const lowStock = Math.max(
    1,
    Number(value.lowStock ?? defaultStockThresholds.lowStock) || defaultStockThresholds.lowStock
  );
  const criticalCandidate = Math.max(
    0,
    Number(value.criticalStock ?? defaultStockThresholds.criticalStock) || defaultStockThresholds.criticalStock
  );

  return {
    lowStock,
    criticalStock: Math.min(criticalCandidate, lowStock),
  };
};

const getStockThresholds = async () => {
  const result = await db.query(
    `SELECT value FROM settings WHERE key = ?`,
    [STOCK_ALERT_THRESHOLDS_KEY]
  );
  const row = result.rows?.[0];

  if (!row?.value) return defaultStockThresholds;

  try {
    return normalizeStockThresholds(JSON.parse(row.value));
  } catch {
    return defaultStockThresholds;
  }
};

// ── Date expression helpers ───────────────────────────────────────────────────
// Timestamps are stored as TIMESTAMP (without timezone) in the server's local
// timezone (set via ALTER DATABASE ... SET timezone). No conversion needed.

const localSaleDateExpr = `COALESCE(s.paid_at, s.created_at)::date`;

const dateBetween  = `${localSaleDateExpr} BETWEEN ?::date AND ?::date`;
const singleDateEq = `${localSaleDateExpr} = ?::date`;

// ── Filter builder ────────────────────────────────────────────────────────────

const buildPaidRangeFilter = (user_id = null) => {
  const params = [];
  let userFilter = "";

  return {
    pushDates(from, to) {
      params.push(normalizeDate(from), normalizeDate(to));
      return params;
    },
    pushUser() {
      if (user_id !== null && user_id !== undefined && user_id !== "") {
        params.push(Number(user_id));
        userFilter = "AND s.user_id = ?";
      }
      return { params, userFilter, dateFilter: dateBetween };
    },
  };
};

// ── Services ──────────────────────────────────────────────────────────────────

export const getDashboardSummaryService = async (from, to, user_id = null) => {
  const builder = buildPaidRangeFilter(user_id);
  builder.pushDates(from, to);
  const { params, userFilter, dateFilter } = builder.pushUser();
  const statusFilter = `s.status = 'paid'`;

  const totalSalesQuery = `
    SELECT COALESCE(SUM(s.total), 0) AS total_sales
    FROM sales s
    WHERE ${statusFilter} AND ${dateFilter} ${userFilter}
  `;

  const avgTicketQuery = `
    SELECT COALESCE(AVG(s.total), 0) AS avg_ticket
    FROM sales s
    WHERE ${statusFilter} AND ${dateFilter} ${userFilter}
  `;

  const totalTipsQuery = `
    SELECT COALESCE(SUM(s.tip_amount), 0) AS total_tips
    FROM sales s
    WHERE ${statusFilter} AND ${dateFilter} ${userFilter}
  `;

  const profitQuery = `
    SELECT COALESCE(SUM((si.price_at_sale - COALESCE(si.cost_at_sale, 0)) * si.quantity), 0) AS total_profit
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE ${statusFilter} AND ${dateFilter} ${userFilter}
  `;

  const topProductQuery = `
    SELECT p.name, SUM(si.quantity) AS units
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    JOIN sales s ON s.id = si.sale_id
    WHERE ${statusFilter} AND ${dateFilter} ${userFilter}
    GROUP BY p.name
    ORDER BY units DESC
    LIMIT 1
  `;

  const topSellerQuery = `
    SELECT u.name, SUM(s.total) AS total_sold
    FROM sales s
    JOIN users u ON u.id = s.user_id
    WHERE ${statusFilter} AND ${dateFilter} ${userFilter}
    GROUP BY u.name
    ORDER BY total_sold DESC
    LIMIT 1
  `;

  const [totalSales, avgTicket, totalTips, totalProfit, topProduct, topSeller] = await Promise.all([
    db.query(totalSalesQuery, params),
    db.query(avgTicketQuery, params),
    db.query(totalTipsQuery, params),
    db.query(profitQuery, params),
    db.query(topProductQuery, params),
    db.query(topSellerQuery, params),
  ]);

  return {
    total_sales:  Number(totalSales.rows[0]?.total_sales || 0),
    avg_ticket:   Number(avgTicket.rows[0]?.avg_ticket || 0),
    total_profit: Number(totalProfit.rows[0]?.total_profit || 0),
    total_tips:   Number(totalTips.rows[0]?.total_tips || 0),
    top_product: topProduct.rows.length
      ? { name: topProduct.rows[0].name, units: Number(topProduct.rows[0].units) }
      : null,
    top_seller: topSeller.rows.length
      ? { name: topSeller.rows[0].name, total_sold: Number(topSeller.rows[0].total_sold) }
      : null,
  };
};

export const getInventoryMetricsService = async () => {
  const thresholds = await getStockThresholds();

  const result = await db.query(
    `SELECT
       COUNT(*)                                        AS total_products,
       COALESCE(SUM(stock), 0)                         AS total_stock,
       COALESCE(SUM(stock * cost_price), 0)            AS inventory_value,
       COALESCE(SUM((price - cost_price) * stock), 0)  AS potential_profit,
       COUNT(CASE WHEN stock <= ? THEN 1 END)          AS critical_products
     FROM products
     WHERE is_active = 1`,
    [thresholds.criticalStock]
  );

  const row = result.rows[0] || {};

  return {
    total_products:           Number(row.total_products || 0),
    total_stock:              Number(row.total_stock || 0),
    inventory_value:          Number(row.inventory_value || 0),
    potential_profit:         Number(row.potential_profit || 0),
    critical_products:        Number(row.critical_products || 0),
    low_stock_threshold:      Number(thresholds.lowStock),
    critical_stock_threshold: Number(thresholds.criticalStock),
  };
};

export const getCashierRangeData = async (from, to) => {
  const result = await db.query(
    `SELECT
       u.id   AS user_id,
       u.name AS cashier,
       COUNT(s.id)                              AS total_sales,
       COALESCE(SUM(s.total), 0)                AS total_amount,
       COALESCE(SUM(s.tip_amount), 0)           AS total_tips,
       COALESCE(SUM(s.total + s.tip_amount), 0) AS total_collected
     FROM sales s
     JOIN users u ON u.id = s.user_id
     WHERE s.status = 'paid'
       AND ${dateBetween}
     GROUP BY u.id, u.name
     ORDER BY total_collected DESC`,
    [normalizeDate(from), normalizeDate(to)]
  );

  return result.rows.map((row) => ({
    user_id:            Number(row.user_id),
    cashier:            row.cashier,
    total_sales:        Number(row.total_sales),
    total_amount:       Number(row.total_amount),
    total_sales_amount: Number(row.total_amount),
    total_tips:         Number(row.total_tips),
    total_collected:    Number(row.total_collected),
  }));
};

export const getSalesReport = async (from, to) => {
  const result = await db.query(
    `SELECT
       s.id,
       s.monthly_number,
       u.name                         AS seller,
       ROUND(s.total::numeric, 2)                    AS total,
       ROUND(COALESCE(s.tip_amount, 0)::numeric, 2)  AS tip_amount,
       s.paid_at,
       s.created_at
     FROM sales s
     JOIN users u ON u.id = s.user_id
     WHERE s.status = 'paid'
       AND ${dateBetween}
     ORDER BY COALESCE(s.paid_at, s.created_at) DESC`,
    [normalizeDate(from), normalizeDate(to)]
  );

  return result.rows;
};

export const getRangeSalesSummaryService = async (from, to) => {
  const f = normalizeDate(from);
  const t = normalizeDate(to);

  const sales = await getSalesReport(f, t);

  const totalSalesAmount = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const totalTips        = sales.reduce((sum, s) => sum + Number(s.tip_amount || 0), 0);
  const totalCollected   = totalSalesAmount + totalTips;

  return {
    from: f,
    to:   t,
    sales: sales.map((s) => ({
      id:             Number(s.id),
      monthly_number: Number(s.monthly_number ?? s.id),
      total:          Number(s.total || 0),
      tip:            Number(s.tip_amount || 0),
      date:           String(s.paid_at ?? s.created_at ?? "").slice(0, 10),
    })),
    total_sales_amount: totalSalesAmount,
    total_tips:         totalTips,
    total_collected:    totalCollected,
  };
};

export const getDailySalesSummaryService = async (dateValue) => {
  const date = normalizeDate(dateValue);

  const [sales, dashboard, soldProductsResult] = await Promise.all([
    getSalesReport(date, date),
    getDashboardSummaryService(date, date),
    db.query(
      `SELECT
         p.name,
         SUM(si.quantity) AS quantity
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       JOIN sales s ON s.id = si.sale_id
       WHERE s.status = 'paid'
         AND ${singleDateEq}
       GROUP BY p.id, p.name
       ORDER BY quantity DESC, p.name ASC`,
      [date]
    ),
  ]);

  const totalSalesAmount = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const totalTips        = Number(dashboard.total_tips || 0);
  const totalCollected   = totalSalesAmount + totalTips;
  const totalProfit      = Number(dashboard.total_profit || 0);

  return {
    date,
    sales: sales.map((sale) => ({
      id:             Number(sale.id),
      monthly_number: Number(sale.monthly_number ?? sale.id),
      total:          Number(sale.total || 0),
      tip:            Number(sale.tip_amount || 0),
    })),
    total_sales_amount: totalSalesAmount,
    total_tips:         totalTips,
    total_collected:    totalCollected,
    total_profit:       totalProfit,
    sold_products: soldProductsResult.rows.map((row) => ({
      name:     row.name,
      quantity: Number(row.quantity || 0),
    })),
  };
};

// ── Queries para gráficas ─────────────────────────────────────────────────────

export const getSalesByHourService = async (dateValue) => {
  const date = normalizeDate(dateValue);
  const result = await db.query(
    `SELECT
       EXTRACT(HOUR FROM COALESCE(s.paid_at, s.created_at))::int AS hour,
       COUNT(*)                                                    AS total_sales,
       COALESCE(SUM(s.total), 0)                                  AS total_amount
     FROM sales s
     WHERE s.status = 'paid'
       AND ${singleDateEq}
     GROUP BY hour
     ORDER BY hour ASC`,
    [date]
  );
  return result.rows.map((r) => ({
    hour:         Number(r.hour),
    total_sales:  Number(r.total_sales),
    total_amount: Number(r.total_amount),
  }));
};

export const getSalesByDayService = async (from, to) => {
  const f = normalizeDate(from);
  const t = normalizeDate(to);
  const result = await db.query(
    `SELECT
       ${localSaleDateExpr} AS day,
       COUNT(*)                              AS total_sales,
       COALESCE(SUM(s.total), 0)             AS total_amount
     FROM sales s
     WHERE s.status = 'paid'
       AND ${dateBetween}
     GROUP BY day
     ORDER BY day ASC`,
    [f, t]
  );
  return result.rows.map((r) => ({
    day:          String(r.day).slice(0, 10),
    total_sales:  Number(r.total_sales),
    total_amount: Number(r.total_amount),
  }));
};

export const getTopProductsService = async (from, to, limit = 6) => {
  const f = normalizeDate(from);
  const t = normalizeDate(to);
  const result = await db.query(
    `SELECT
       p.name,
       SUM(si.quantity)                          AS units,
       COALESCE(SUM(si.price_at_sale * si.quantity), 0) AS revenue
     FROM sale_items si
     JOIN products p ON p.id = si.product_id
     JOIN sales s    ON s.id = si.sale_id
     WHERE s.status = 'paid'
       AND ${dateBetween}
     GROUP BY p.id, p.name
     ORDER BY units DESC
     LIMIT ?`,
    [f, t, limit]
  );
  return result.rows.map((r) => ({
    name:    r.name,
    units:   Number(r.units),
    revenue: Number(r.revenue),
  }));
};

export const getStockByCategoryService = async () => {
  const result = await db.query(
    `SELECT
       COALESCE(parent.name, c.name) AS category,
       COALESCE(SUM(p.stock), 0)                         AS total_stock,
       COALESCE(SUM(p.stock * p.cost_price), 0)          AS total_value
     FROM products p
     LEFT JOIN categories c      ON c.id = p.category_id
     LEFT JOIN categories parent ON parent.id = c.parent_id
     WHERE p.is_active = 1
     GROUP BY COALESCE(parent.name, c.name)
     ORDER BY total_value DESC
     LIMIT 8`
  );
  return result.rows.map((r) => ({
    category:    r.category || "Sin categoría",
    total_stock: Number(r.total_stock),
    total_value: Number(r.total_value),
  }));
};
