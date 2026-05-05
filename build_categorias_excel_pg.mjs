import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { Workbook, SpreadsheetFile } from "file:///C:/Users/DJMER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "apps", "backend", ".env") });

const outputDir = "C:/Users/DJMER/Desktop/Nueva carpeta (2)";
const outputPath = path.join(outputDir, "categorias_y_alimentos_postgres.xlsx");

const pool = new pg.Pool({
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "",
  database: process.env.PG_DATABASE || "pos",
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const queryData = async () => {
  const sql = `
    WITH RECURSIVE category_tree AS (
      SELECT
        c.id,
        c.name,
        c.parent_id,
        c.is_active,
        c.display_order,
        c.printer_target,
        c.name::text AS category_path,
        0 AS category_level
      FROM categories c
      WHERE c.parent_id IS NULL

      UNION ALL

      SELECT
        c.id,
        c.name,
        c.parent_id,
        c.is_active,
        c.display_order,
        c.printer_target,
        (ct.category_path || ' > ' || c.name)::text AS category_path,
        ct.category_level + 1 AS category_level
      FROM categories c
      JOIN category_tree ct ON ct.id = c.parent_id
    )
    SELECT
      ct.category_path,
      ct.name AS category_name,
      parent.name AS parent_category,
      ct.category_level,
      ct.id AS category_id,
      ct.is_active AS category_active,
      ct.display_order AS category_order,
      ct.printer_target,
      p.id AS product_id,
      p.name AS product_name,
      p.stock,
      p.cost_price,
      p.price,
      p.is_active AS product_active,
      p.display_order AS product_order
    FROM category_tree ct
    LEFT JOIN categories parent ON parent.id = ct.parent_id
    LEFT JOIN products p ON p.category_id = ct.id
    ORDER BY
      ct.category_path,
      p.display_order NULLS LAST,
      p.id NULLS LAST
  `;

  const result = await pool.query(sql);
  return result.rows;
};

const summarize = (rows) => {
  const map = new Map();

  for (const row of rows) {
    const key = Number(row.category_id);
    if (!map.has(key)) {
      map.set(key, {
        category_path: row.category_path,
        category_name: row.category_name,
        parent_category: row.parent_category ?? "",
        category_level: Number(row.category_level ?? 0),
        category_id: key,
        category_active: Number(row.category_active ?? 0) === 1 ? "Si" : "No",
        printer_target: row.printer_target ?? "",
        product_count: 0,
        active_product_count: 0,
      });
    }

    if (row.product_id != null) {
      const current = map.get(key);
      current.product_count += 1;
      if (Number(row.product_active ?? 0) === 1) {
        current.active_product_count += 1;
      }
    }
  }

  return [...map.values()].sort((a, b) => a.category_path.localeCompare(b.category_path, "es"));
};

const buildWorkbook = (rows) => {
  const workbook = Workbook.create();
  const detailSheet = workbook.worksheets.add("Detalle");
  const summarySheet = workbook.worksheets.add("Resumen");

  const detailHeader = [[
    "Ruta categoria",
    "Categoria",
    "Categoria padre",
    "Nivel",
    "ID categoria",
    "Categoria activa",
    "Orden categoria",
    "Impresora",
    "ID producto",
    "Producto",
    "Stock",
    "Costo",
    "Precio",
    "Producto activo",
    "Orden producto",
  ]];

  const detailRows = rows.map((row) => [
    row.category_path,
    row.category_name,
    row.parent_category ?? "",
    Number(row.category_level ?? 0),
    Number(row.category_id),
    Number(row.category_active ?? 0) === 1 ? "Si" : "No",
    Number(row.category_order ?? 0),
    row.printer_target ?? "",
    row.product_id == null ? "" : Number(row.product_id),
    row.product_name ?? "",
    row.product_id == null ? "" : Number(row.stock ?? 0),
    row.product_id == null ? "" : Number(row.cost_price ?? 0),
    row.product_id == null ? "" : Number(row.price ?? 0),
    row.product_id == null ? "" : Number(row.product_active ?? 0) === 1 ? "Si" : "No",
    row.product_id == null ? "" : Number(row.product_order ?? 0),
  ]);

  const detailMatrix = [...detailHeader, ...detailRows];
  const detailRange = detailSheet.getRange("A1").write(detailMatrix);
  detailSheet.freezePanes.freezeRows(1);
  detailRange.format.wrapText = true;
  detailRange.format.autofitColumns();
  detailSheet.getRange("A1:O1").format.fill.color = "#1F4E78";
  detailSheet.getRange("A1:O1").format.font.color = "#FFFFFF";
  detailSheet.getRange("A1:O1").format.font.bold = true;
  detailSheet.getRange(`L2:M${detailMatrix.length}`).format.numberFormat = "#,##0.00";

  const summaryRows = summarize(rows);
  const summaryHeader = [[
    "Ruta categoria",
    "Categoria",
    "Categoria padre",
    "Nivel",
    "ID categoria",
    "Categoria activa",
    "Impresora",
    "Productos",
    "Productos activos",
  ]];

  const summaryMatrix = [
    ...summaryHeader,
    ...summaryRows.map((row) => [
      row.category_path,
      row.category_name,
      row.parent_category,
      row.category_level,
      row.category_id,
      row.category_active,
      row.printer_target,
      row.product_count,
      row.active_product_count,
    ]),
  ];

  const summaryRange = summarySheet.getRange("A1").write(summaryMatrix);
  summarySheet.freezePanes.freezeRows(1);
  summaryRange.format.wrapText = true;
  summaryRange.format.autofitColumns();
  summarySheet.getRange("A1:I1").format.fill.color = "#385723";
  summarySheet.getRange("A1:I1").format.font.color = "#FFFFFF";
  summarySheet.getRange("A1:I1").format.font.bold = true;

  return workbook;
};

try {
  const rows = await queryData();
  const workbook = buildWorkbook(rows);
  await fs.mkdir(outputDir, { recursive: true });
  const exported = await SpreadsheetFile.exportXlsx(workbook);
  await exported.save(outputPath);

  console.log(JSON.stringify({
    outputPath,
    totalRows: rows.length,
    totalCategories: new Set(rows.map((row) => Number(row.category_id))).size,
    totalProducts: rows.filter((row) => row.product_id != null).length,
  }, null, 2));
} finally {
  await pool.end();
}
