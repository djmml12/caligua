import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

const pool = new pg.Pool({
  host:                   process.env.PG_HOST     || "localhost",
  port:                   Number(process.env.PG_PORT) || 5432,
  user:                   process.env.PG_USER     || "postgres",
  password:               process.env.PG_PASSWORD || "",
  database:               process.env.PG_DATABASE || "pos",
  max:                    10,
  idleTimeoutMillis:      30000,
  connectionTimeoutMillis:5000,
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL pool error:", err.message);
});

// Convert ? placeholders to $1, $2, $3… for PostgreSQL
const convertParams = (sql, params = []) => {
  let i = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++i}`);
  return { pgSql, pgParams: params };
};

const runQuery = async (executor, text, params = []) => {
  const { pgSql, pgParams } = convertParams(text, params);
  try {
    const result = await executor.query(pgSql, pgParams);
    return {
      rows:     result.rows,
      rowCount: result.rowCount,
      lastID:   result.rows[0]?.id ?? null,
      changes:  result.rowCount ?? 0,
    };
  } catch (error) {
    console.error("❌ PostgreSQL error:", error.message, "\nSQL:", pgSql);
    throw error;
  }
};

export const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const closeDatabase = async () => {
  await pool.end();
};

const db = {
  query:       (text, params = [])           => runQuery(pool,   text, params),
  queryClient: (client, text, params = [])   => runQuery(client, text, params),
};

const host = process.env.PG_HOST     || "localhost";
const port = process.env.PG_PORT     || 5432;
const name = process.env.PG_DATABASE || "pos";
console.log(`🗄 PostgreSQL → ${host}:${port}/${name}`);

export default db;
