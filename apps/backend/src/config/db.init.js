import bcrypt from "bcrypt";
import db from "./db.js";

// ── DDL ───────────────────────────────────────────────────────────────────────

const createTables = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id   SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS permissions (
      id   SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id       INTEGER NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       TEXT        NOT NULL,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT        NOT NULL,
      role_id    INTEGER     REFERENCES roles(id),
      is_active  SMALLINT    DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id            SERIAL PRIMARY KEY,
      name          TEXT     UNIQUE NOT NULL,
      is_active     SMALLINT DEFAULT 1,
      display_order INTEGER  DEFAULT 0,
      parent_id     INTEGER  REFERENCES categories(id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id            SERIAL PRIMARY KEY,
      name          TEXT          NOT NULL,
      stock         INTEGER       DEFAULT 0,
      cost_price    NUMERIC(12,4) DEFAULT 0,
      price         NUMERIC(12,4) NOT NULL,
      category_id   INTEGER       REFERENCES categories(id),
      is_active     SMALLINT      DEFAULT 1,
      display_order INTEGER       DEFAULT 0
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id            SERIAL PRIMARY KEY,
      product_id    INTEGER     REFERENCES products(id),
      quantity      INTEGER,
      movement_type TEXT,
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER       REFERENCES users(id),
      total          NUMERIC(12,4) DEFAULT 0,
      status         TEXT          DEFAULT 'open',
      reference      TEXT,
      created_at     TIMESTAMP   DEFAULT NOW(),
      canceled_at    TIMESTAMP,
      canceled_by    INTEGER       REFERENCES users(id),
      paid_by        INTEGER       REFERENCES users(id),
      paid_at        TIMESTAMP,
      tip_amount     NUMERIC(12,4) DEFAULT 0,
      tip_percentage NUMERIC(6,2)  DEFAULT 0,
      notes          TEXT,
      monthly_number INTEGER
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id            SERIAL PRIMARY KEY,
      sale_id       INTEGER       REFERENCES sales(id) ON DELETE CASCADE,
      product_id    INTEGER       REFERENCES products(id),
      quantity      INTEGER,
      price_at_sale NUMERIC(12,4),
      cost_at_sale  NUMERIC(12,4),
      subtotal      NUMERIC(12,4),
      notes         TEXT
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS email_outbox (
      id           SERIAL PRIMARY KEY,
      to_addr      TEXT        NOT NULL,
      cc_addrs     TEXT        DEFAULT '[]',
      subject      TEXT        NOT NULL,
      body         TEXT        NOT NULL,
      status       TEXT        DEFAULT 'pending',
      attempts     INTEGER     DEFAULT 0,
      next_try_at  TIMESTAMP   DEFAULT NOW(),
      last_error   TEXT,
      created_at   TIMESTAMP   DEFAULT NOW(),
      sent_at      TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS email_log (
      id          SERIAL PRIMARY KEY,
      created_at  TIMESTAMP DEFAULT NOW(),
      event       TEXT      NOT NULL,
      to_addr     TEXT,
      subject     TEXT,
      error_code  TEXT,
      error_msg   TEXT,
      duration_ms INTEGER,
      dns_used    TEXT
    )
  `);
};

// ── Indexes ───────────────────────────────────────────────────────────────────

const createIndexes = async () => {
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_users_email
       ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_categories_parent_active_order
       ON categories(parent_id, is_active, display_order)`,
    `CREATE INDEX IF NOT EXISTS idx_products_category_active_order
       ON products(category_id, is_active, display_order)`,
    `CREATE INDEX IF NOT EXISTS idx_sales_status_created_at
       ON sales(status, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_sales_status_paid_at
       ON sales(status, paid_at)`,
    `CREATE INDEX IF NOT EXISTS idx_sales_user_status
       ON sales(user_id, status)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_monthly_num
       ON sales(date_trunc('month', created_at), monthly_number)
       WHERE monthly_number IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id
       ON sale_items(sale_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sale_items_product_id
       ON sale_items(product_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_created
       ON inventory_movements(product_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_email_outbox_pending_next
       ON email_outbox(next_try_at) WHERE status = 'pending'`,
    `CREATE INDEX IF NOT EXISTS idx_email_log_created
       ON email_log(created_at DESC)`,
  ];

  for (const sql of indexes) {
    await db.query(sql);
  }
};

// ── Seed data ─────────────────────────────────────────────────────────────────

const seedRoles = async () => {
  const roles = [
    { id: 1, name: "admin" },
    { id: 2, name: "supervisor" },
    { id: 3, name: "cashier" },
  ];

  for (const role of roles) {
    await db.query(
      `INSERT INTO roles (id, name) VALUES (?, ?) ON CONFLICT DO NOTHING`,
      [role.id, role.name]
    );
  }
};

const seedPermissions = async () => {
  const permissions = [
    { id: 1, name: "view_dashboard" },
    { id: 2, name: "manage_products" },
    { id: 3, name: "manage_categories" },
    { id: 4, name: "manage_users" },
    { id: 5, name: "process_sales" },
    { id: 6, name: "view_reports" },
    { id: 7, name: "cancel_sales" },
  ];

  for (const perm of permissions) {
    await db.query(
      `INSERT INTO permissions (id, name) VALUES (?, ?) ON CONFLICT DO NOTHING`,
      [perm.id, perm.name]
    );
    await db.query(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES (1, ?) ON CONFLICT DO NOTHING`,
      [perm.id]
    );
  }
};

// After inserting rows with explicit IDs the SERIAL sequences must be advanced,
// otherwise the next auto-generated ID would collide with the seeded ones.
const resetSequences = async () => {
  await db.query(`SELECT setval('roles_id_seq',       (SELECT MAX(id) FROM roles),       true)`);
  await db.query(`SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions), true)`);
};

const seedAdminUser = async () => {
  const { rows } = await db.query(
    `SELECT id FROM users WHERE email = ?`,
    ["admin@pos.com"]
  );
  if (rows.length === 0) {
    const hash = await bcrypt.hash("admin123", 10);
    await db.query(
      `INSERT INTO users (name, email, password, role_id) VALUES (?, ?, ?, ?)`,
      ["Admin", "admin@pos.com", hash, 1]
    );
    console.log("👤 Usuario admin creado: admin@pos.com / admin123");
  }
};

const seedSettings = async () => {
  await db.query(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    ["tip_percentage", "15"]
  );
};

// ── Backfill monthly_number for rows that may lack it ────────────────────────

const backfillMonthlyNumbers = async () => {
  const { rows } = await db.query(
    `SELECT id, TO_CHAR(created_at, 'YYYY-MM') AS month
       FROM sales
      WHERE monthly_number IS NULL
      ORDER BY created_at ASC`
  );
  if (rows.length === 0) return;

  const monthCounters = new Map();
  for (const row of rows) {
    const month = row.month ?? "unknown";
    if (!monthCounters.has(month)) {
      const { rows: maxRows } = await db.query(
        `SELECT COALESCE(MAX(monthly_number), 0) AS mx
           FROM sales
          WHERE TO_CHAR(created_at, 'YYYY-MM') = ?
            AND monthly_number IS NOT NULL`,
        [month]
      );
      monthCounters.set(month, Number(maxRows[0]?.mx ?? 0));
    }
    const next = monthCounters.get(month) + 1;
    monthCounters.set(month, next);
    await db.query(`UPDATE sales SET monthly_number = ? WHERE id = ?`, [next, row.id]);
  }
};

// ── Migrations (idempotent schema changes for existing DBs) ──────────────────

const applyMigrations = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id            SERIAL PRIMARY KEY,
      customer_name TEXT          NOT NULL,
      phone         TEXT,
      date          DATE          NOT NULL,
      time          TIME,
      items         JSONB         NOT NULL DEFAULT '[]',
      total         NUMERIC(12,4) DEFAULT 0,
      notes         TEXT,
      status        TEXT          DEFAULT 'pending',
      created_by    INTEGER       REFERENCES users(id),
      created_at    TIMESTAMP     DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_reservations_date
      ON reservations(date)
  `);
  await db.query(`
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS printer_target VARCHAR(20) DEFAULT 'kitchen'
  `);
  await db.query(`
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_request_id TEXT
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_request_id
      ON sales(client_request_id)
      WHERE client_request_id IS NOT NULL
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_outbox (
      id           SERIAL PRIMARY KEY,
      to_addr      TEXT        NOT NULL,
      cc_addrs     TEXT        DEFAULT '[]',
      subject      TEXT        NOT NULL,
      body         TEXT        NOT NULL,
      status       TEXT        DEFAULT 'pending',
      attempts     INTEGER     DEFAULT 0,
      next_try_at  TIMESTAMP   DEFAULT NOW(),
      last_error   TEXT,
      created_at   TIMESTAMP   DEFAULT NOW(),
      sent_at      TIMESTAMP
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_email_outbox_pending_next
      ON email_outbox(next_try_at) WHERE status = 'pending'
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_log (
      id          SERIAL PRIMARY KEY,
      created_at  TIMESTAMP DEFAULT NOW(),
      event       TEXT      NOT NULL,
      to_addr     TEXT,
      subject     TEXT,
      error_code  TEXT,
      error_msg   TEXT,
      duration_ms INTEGER,
      dns_used    TEXT
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_email_log_created
      ON email_log(created_at DESC)
  `);
};

// ── Main ──────────────────────────────────────────────────────────────────────

export const initDB = async () => {
  try {
    console.log("🛠 Inicializando base de datos PostgreSQL...");
    await createTables();
    await applyMigrations();
    await createIndexes();
    await seedRoles();
    await seedPermissions();
    await resetSequences();
    await seedAdminUser();
    await seedSettings();
    await backfillMonthlyNumbers();
    console.log("✅ Base de datos lista");
  } catch (error) {
    console.error("❌ DB INIT ERROR:", error);
    throw error;
  }
};
