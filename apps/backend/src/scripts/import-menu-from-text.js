import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db, { withTransaction } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Uso: node src/scripts/import-menu-from-text.js <ruta-del-txt>");
  process.exit(1);
}

const CATEGORY_RE = /^- Categoria:\s*(.+?)\s*\(ID\s+(\d+),\s*Activa\)\s*$/i;
const PRODUCT_RE = /^\*\s*(.+?)\s*\(ID\s+(\d+),\s*Precio\s+([0-9.]+),\s*Stock\s+([0-9.]+),\s*Activo\)\s*$/i;

const BAR_KEYWORDS = [
  "tes",
  "aguas frescas",
  "picheles naturales",
  "smoothie",
  "licuados",
  "bebidas compuestas",
  "cafe",
  "frapes",
  "sodas",
  "bebidas preparadas",
  "shots",
  "cervezas",
  "tequilas",
  "ron",
  "whisky",
  "vinos",
  "vodka",
  "otros",
];

function normalizeName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function printerTargetForCategory(name) {
  const normalized = normalizeName(name);
  return BAR_KEYWORDS.includes(normalized) ? "bar" : "kitchen";
}

function parseCatalog(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const categories = [];
  const products = [];
  let currentCategory = null;

  for (const line of lines) {
    const categoryMatch = line.match(CATEGORY_RE);
    if (categoryMatch) {
      const [, name, id] = categoryMatch;
      currentCategory = {
        id: Number(id),
        name: name.trim(),
        printer_target: printerTargetForCategory(name),
      };
      categories.push(currentCategory);
      continue;
    }

    const normalizedLine = line.replace(/^\*\s*/, "* ");
    const productMatch = normalizedLine.match(PRODUCT_RE);
    if (productMatch) {
      if (!currentCategory) {
        throw new Error(`Producto sin categoria previa: ${line}`);
      }
      const [, name, id, price, stock] = productMatch;
      products.push({
        id: Number(id),
        name: name.trim(),
        price: Number(price),
        stock: Number(stock),
        cost_price: 0,
        category_id: currentCategory.id,
      });
      continue;
    }

    throw new Error(`Linea no reconocida: ${line}`);
  }

  return { categories, products };
}

async function importCatalog(catalog) {
  const salesCheck = await db.query("SELECT COUNT(*) AS count FROM sales");
  const salesCount = Number(salesCheck.rows[0]?.count ?? 0);
  if (salesCount > 0) {
    throw new Error(`La base ya tiene ${salesCount} ventas; importacion cancelada para no romper historial.`);
  }

  await withTransaction(async (client) => {
    await db.queryClient(client, "DELETE FROM inventory_movements");
    await db.queryClient(client, "DELETE FROM sale_items");
    await db.queryClient(client, "DELETE FROM products");
    await db.queryClient(client, "DELETE FROM categories");

    for (let index = 0; index < catalog.categories.length; index += 1) {
      const category = catalog.categories[index];
      await db.queryClient(
        client,
        `INSERT INTO categories (id, name, is_active, display_order, parent_id, printer_target)
         VALUES (?, ?, 1, ?, NULL, ?)`,
        [category.id, category.name, index, category.printer_target]
      );
    }

    const productOrderByCategory = new Map();
    for (const product of catalog.products) {
      const displayOrder = productOrderByCategory.get(product.category_id) ?? 0;
      productOrderByCategory.set(product.category_id, displayOrder + 1);

      await db.queryClient(
        client,
        `INSERT INTO products (id, name, stock, cost_price, price, category_id, is_active, display_order)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          product.id,
          product.name,
          product.stock,
          product.cost_price,
          product.price,
          product.category_id,
          displayOrder,
        ]
      );
    }

    const maxCategoryId = Math.max(...catalog.categories.map((category) => category.id));
    const maxProductId = Math.max(...catalog.products.map((product) => product.id));

    await db.queryClient(client, "SELECT setval('categories_id_seq', ?, true)", [maxCategoryId]);
    await db.queryClient(client, "SELECT setval('products_id_seq', ?, true)", [maxProductId]);
  });
}

async function main() {
  const resolvedPath = path.resolve(__dirname, "..", "..", "..", "..", "..", inputPath);
  const fallbackPath = path.resolve(inputPath);
  const finalPath = fs.existsSync(inputPath)
    ? inputPath
    : fs.existsSync(resolvedPath)
      ? resolvedPath
      : fallbackPath;

  if (!fs.existsSync(finalPath)) {
    throw new Error(`No se encontro el archivo: ${inputPath}`);
  }

  const text = fs.readFileSync(finalPath, "utf8");
  const catalog = parseCatalog(text);

  console.log(`Categorias encontradas: ${catalog.categories.length}`);
  console.log(`Productos encontrados: ${catalog.products.length}`);

  await importCatalog(catalog);

  console.log("Importacion completada.");
}

main().catch((error) => {
  console.error("Error importando catalogo:", error);
  process.exit(1);
});
