import db from "../config/db.js";
import { withTransaction } from "../config/db.js";

/**
 * Coffee shop products seed script
 * Clears existing products and adds 100 realistic coffee shop items
 */

const categories = [
  { name: "Café", icon: "☕" },
  { name: "Bebidas Frías", icon: "🧊" },
  { name: "Repostería", icon: "🍰" },
  { name: "Sándwiches", icon: "🥪" },
  { name: "Desayunos", icon: "🥐" },
  { name: "Postres", icon: "🍮" },
  { name: "Bebidas Calientes", icon: "🫖" },
  { name: "Comidas Ligeras", icon: "🥗" },
];

const coffeeShopProducts = [
  // ☕ CAFÉ (12 items)
  { category: "Café", name: "Café Americano", cost: 3.50, price: 12.00, stock: 50 },
  { category: "Café", name: "Espresso", cost: 4.00, price: 14.00, stock: 50 },
  { category: "Café", name: "Cappuccino", cost: 5.50, price: 18.00, stock: 45 },
  { category: "Café", name: "Latte", cost: 5.50, price: 19.00, stock: 45 },
  { category: "Café", name: "Macchiato", cost: 5.00, price: 16.00, stock: 40 },
  { category: "Café", name: "Cortadito", cost: 3.50, price: 13.00, stock: 50 },
  { category: "Café", name: "Café Viennés", cost: 6.00, price: 22.00, stock: 35 },
  { category: "Café", name: "Café Mocha", cost: 6.50, price: 24.00, stock: 40 },
  { category: "Café", name: "Café Irlandés", cost: 8.00, price: 35.00, stock: 25 },
  { category: "Café", name: "Café Con Leche", cost: 4.00, price: 15.00, stock: 50 },
  { category: "Café", name: "Café Descafeinado", cost: 4.00, price: 14.00, stock: 30 },
  { category: "Café", name: "Café Tinto", cost: 2.50, price: 10.00, stock: 60 },

  // 🧊 BEBIDAS FRÍAS (15 items)
  { category: "Bebidas Frías", name: "Frappé Caramelo", cost: 6.00, price: 22.00, stock: 45 },
  { category: "Bebidas Frías", name: "Frappé Chocolate", cost: 6.00, price: 22.00, stock: 45 },
  { category: "Bebidas Frías", name: "Frappé Vainilla", cost: 6.00, price: 22.00, stock: 45 },
  { category: "Bebidas Frías", name: "Iced Coffee", cost: 5.00, price: 18.00, stock: 50 },
  { category: "Bebidas Frías", name: "Cold Brew", cost: 5.50, price: 20.00, stock: 40 },
  { category: "Bebidas Frías", name: "Jugo de Naranja", cost: 4.00, price: 14.00, stock: 40 },
  { category: "Bebidas Frías", name: "Jugo de Zanahoria", cost: 4.50, price: 16.00, stock: 35 },
  { category: "Bebidas Frías", name: "Limonada Natural", cost: 3.00, price: 12.00, stock: 50 },
  { category: "Bebidas Frías", name: "Té Helado Durazno", cost: 3.50, price: 13.00, stock: 45 },
  { category: "Bebidas Frías", name: "Agua Mineral 500ml", cost: 1.50, price: 6.00, stock: 100 },
  { category: "Bebidas Frías", name: "Agua Mineral 1L", cost: 2.50, price: 8.00, stock: 80 },
  { category: "Bebidas Frías", name: "Bebida Energética", cost: 6.00, price: 18.00, stock: 40 },
  { category: "Bebidas Frías", name: "Refesco Sabor Fresa", cost: 4.00, price: 14.00, stock: 50 },
  { category: "Bebidas Frías", name: "Refesco Sabor Lima", cost: 4.00, price: 14.00, stock: 50 },
  { category: "Bebidas Frías", name: "Batido de Plátano", cost: 5.00, price: 18.00, stock: 40 },

  // 🍰 REPOSTERÍA (18 items)
  { category: "Repostería", name: "Croissant de Chocolate", cost: 4.00, price: 14.00, stock: 40 },
  { category: "Repostería", name: "Croissant de Almendra", cost: 4.50, price: 16.00, stock: 35 },
  { category: "Repostería", name: "Pan de Chocolate", cost: 3.50, price: 13.00, stock: 40 },
  { category: "Repostería", name: "Muffin de Chocolate", cost: 3.50, price: 13.00, stock: 45 },
  { category: "Repostería", name: "Muffin de Arándano", cost: 3.50, price: 13.00, stock: 45 },
  { category: "Repostería", name: "Muffin de Vainilla", cost: 3.50, price: 13.00, stock: 45 },
  { category: "Repostería", name: "Donut Glaseado", cost: 2.50, price: 9.00, stock: 50 },
  { category: "Repostería", name: "Donut de Chocolate", cost: 2.50, price: 9.00, stock: 50 },
  { category: "Repostería", name: "Donut Relleno de Crema", cost: 3.00, price: 11.00, stock: 45 },
  { category: "Repostería", name: "Pastel de Chocolate", cost: 8.00, price: 28.00, stock: 30 },
  { category: "Repostería", name: "Pastel de Vainilla", cost: 8.00, price: 28.00, stock: 30 },
  { category: "Repostería", name: "Brownie", cost: 4.00, price: 14.00, stock: 40 },
  { category: "Repostería", name: "Galleta de Chocolate", cost: 2.00, price: 7.00, stock: 60 },
  { category: "Repostería", name: "Galleta de Avena", cost: 2.00, price: 7.00, stock: 60 },
  { category: "Repostería", name: "Barra de Granola", cost: 2.50, price: 9.00, stock: 50 },
  { category: "Repostería", name: "Tarta de Frutas", cost: 10.00, price: 36.00, stock: 20 },
  { category: "Repostería", name: "Cupcake Chocolate", cost: 3.50, price: 13.00, stock: 40 },
  { category: "Repostería", name: "Cupcake Vainilla", cost: 3.50, price: 13.00, stock: 40 },

  // 🥪 SÁNDWICHES (12 items)
  { category: "Sándwiches", name: "Sandwich de Pollo", cost: 8.00, price: 28.00, stock: 40 },
  { category: "Sándwiches", name: "Sandwich de Jamón y Queso", cost: 7.00, price: 25.00, stock: 45 },
  { category: "Sándwiches", name: "Sandwich de Pavo", cost: 8.50, price: 30.00, stock: 38 },
  { category: "Sándwiches", name: "Sandwich Vegetal", cost: 6.50, price: 23.00, stock: 40 },
  { category: "Sándwiches", name: "Sandwich BLT", cost: 8.00, price: 28.00, stock: 40 },
  { category: "Sándwiches", name: "Sandwich de Atún", cost: 7.50, price: 26.00, stock: 35 },
  { category: "Sándwiches", name: "Sandwich de Queso Fundido", cost: 6.00, price: 22.00, stock: 45 },
  { category: "Sándwiches", name: "Sandwich Caprese", cost: 8.00, price: 28.00, stock: 38 },
  { category: "Sándwiches", name: "Sandwich de Roast Beef", cost: 9.00, price: 32.00, stock: 35 },
  { category: "Sándwiches", name: "Sandwich Falafel", cost: 7.00, price: 25.00, stock: 40 },
  { category: "Sándwiches", name: "Wrap de Pollo", cost: 8.50, price: 30.00, stock: 38 },
  { category: "Sándwiches", name: "Wrap Vegetal", cost: 7.00, price: 25.00, stock: 40 },

  // 🥐 DESAYUNOS (10 items)
  { category: "Desayunos", name: "Huevos Revueltos", cost: 6.00, price: 22.00, stock: 30 },
  { category: "Desayunos", name: "Huevos al Plato", cost: 6.00, price: 22.00, stock: 30 },
  { category: "Desayunos", name: "Omelette de Queso", cost: 6.50, price: 24.00, stock: 28 },
  { category: "Desayunos", name: "Omelette Vegetariana", cost: 7.00, price: 25.00, stock: 28 },
  { category: "Desayunos", name: "Yogur con Granola", cost: 4.50, price: 16.00, stock: 40 },
  { category: "Desayunos", name: "Avena", cost: 3.50, price: 13.00, stock: 35 },
  { category: "Desayunos", name: "Tostadas Francesas", cost: 6.00, price: 22.00, stock: 30 },
  { category: "Desayunos", name: "Desayuno Completo (Huevos + Pan)", cost: 7.50, price: 28.00, stock: 25 },
  { category: "Desayunos", name: "Sándwich de Huevo y Jamón", cost: 7.00, price: 25.00, stock: 35 },
  { category: "Desayunos", name: "Batido de Frutas", cost: 4.50, price: 16.00, stock: 40 },

  // 🫖 BEBIDAS CALIENTES (8 items)
  { category: "Bebidas Calientes", name: "Té Negro", cost: 2.50, price: 10.00, stock: 50 },
  { category: "Bebidas Calientes", name: "Té Verde", cost: 2.50, price: 10.00, stock: 50 },
  { category: "Bebidas Calientes", name: "Té de Chamomila", cost: 2.50, price: 10.00, stock: 50 },
  { category: "Bebidas Calientes", name: "Té de Menta", cost: 2.50, price: 10.00, stock: 50 },
  { category: "Bebidas Calientes", name: "Chocolate Caliente", cost: 4.00, price: 14.00, stock: 45 },
  { category: "Bebidas Calientes", name: "Chocolate con Churros", cost: 6.00, price: 22.00, stock: 30 },
  { category: "Bebidas Calientes", name: "Atole", cost: 3.50, price: 12.00, stock: 40 },
  { category: "Bebidas Calientes", name: "Leche Caliente", cost: 2.50, price: 10.00, stock: 50 },

  // 🥗 COMIDAS LIGERAS (25 items)
  { category: "Comidas Ligeras", name: "Ensalada César", cost: 6.00, price: 22.00, stock: 35 },
  { category: "Comidas Ligeras", name: "Ensalada Griega", cost: 6.50, price: 23.00, stock: 35 },
  { category: "Comidas Ligeras", name: "Ensalada Caprese", cost: 6.50, price: 23.00, stock: 35 },
  { category: "Comidas Ligeras", name: "Ensalada Mixta", cost: 5.50, price: 20.00, stock: 40 },
  { category: "Comidas Ligeras", name: "Burrito de Pollo", cost: 8.00, price: 28.00, stock: 40 },
  { category: "Comidas Ligeras", name: "Burrito de Res", cost: 8.50, price: 30.00, stock: 38 },
  { category: "Comidas Ligeras", name: "Burrito Vegetariano", cost: 7.00, price: 25.00, stock: 40 },
  { category: "Comidas Ligeras", name: "Nachos con Guacamole", cost: 7.00, price: 25.00, stock: 30 },
  { category: "Comidas Ligeras", name: "Quesadilla de Queso", cost: 6.00, price: 22.00, stock: 35 },
  { category: "Comidas Ligeras", name: "Quesadilla de Pollo", cost: 7.00, price: 25.00, stock: 35 },
  { category: "Comidas Ligeras", name: "Quesadilla de Champiñones", cost: 6.50, price: 23.00, stock: 35 },
  { category: "Comidas Ligeras", name: "Tacos de Pollo", cost: 6.00, price: 22.00, stock: 40 },
  { category: "Comidas Ligeras", name: "Tacos de Res", cost: 6.50, price: 23.00, stock: 40 },
  { category: "Comidas Ligeras", name: "Tacos Veganos", cost: 5.50, price: 20.00, stock: 40 },
  { category: "Comidas Ligeras", name: "Hummus con Vegetales", cost: 5.50, price: 20.00, stock: 30 },
  { category: "Comidas Ligeras", name: "Tabla de Quesos y Charcutería", cost: 10.00, price: 36.00, stock: 25 },
  { category: "Comidas Ligeras", name: "Tabla de Frutas", cost: 8.00, price: 28.00, stock: 20 },
];

// 🍮 POSTRES (16 items adicionales)
const postresAdicionales = [
  { category: "Postres", name: "Flan", cost: 4.00, price: 14.00, stock: 35 },
  { category: "Postres", name: "Tiramisú", cost: 6.00, price: 22.00, stock: 25 },
  { category: "Postres", name: "Cheesecake", cost: 6.50, price: 24.00, stock: 25 },
  { category: "Postres", name: "Mousse de Chocolate", cost: 5.00, price: 18.00, stock: 30 },
  { category: "Postres", name: "Helado de Vainilla", cost: 3.50, price: 13.00, stock: 50 },
  { category: "Postres", name: "Helado de Chocolate", cost: 3.50, price: 13.00, stock: 50 },
  { category: "Postres", name: "Helado de Fresa", cost: 3.50, price: 13.00, stock: 50 },
  { category: "Postres", name: "Helado de Menta", cost: 3.50, price: 13.00, stock: 50 },
  { category: "Postres", name: "Fruta Fresca", cost: 2.50, price: 10.00, stock: 60 },
  { category: "Postres", name: "Papaya con Crema", cost: 4.00, price: 14.00, stock: 40 },
  { category: "Postres", name: "Piña en Jugo", cost: 3.50, price: 13.00, stock: 45 },
  { category: "Postres", name: "Gelatina", cost: 2.00, price: 8.00, stock: 60 },
  { category: "Postres", name: "Pudín de Vainilla", cost: 3.00, price: 11.00, stock: 50 },
  { category: "Postres", name: "Flor de Hojaldre", cost: 3.50, price: 13.00, stock: 40 },
  { category: "Postres", name: "Panelitas de Elote", cost: 2.50, price: 9.00, stock: 50 },
  { category: "Postres", name: "Arroz Dulce", cost: 4.00, price: 14.00, stock: 35 },
];

coffeeShopProducts.push(...postresAdicionales);

const seedProducts = async () => {
  await withTransaction(async (client) => {
    // Delete all existing products
    await db.queryClient(client, "DELETE FROM sale_items");
    await db.queryClient(client, "DELETE FROM products");
    await db.queryClient(client, "DELETE FROM categories");
    console.log("🗑 Productos y categorías eliminados");

    // Reset category sequence
    await db.queryClient(
      client,
      "SELECT setval('categories_id_seq', 1, false)"
    );

    // Insert categories
    const categoryMap = {};
    for (const cat of categories) {
      const result = await db.queryClient(
        client,
        "INSERT INTO categories (name, is_active, display_order) VALUES (?, 1, ?) RETURNING id",
        [cat.name, Object.keys(categoryMap).length]
      );
      categoryMap[cat.name] = result.rows[0].id;
    }
    console.log(`📁 ${Object.keys(categoryMap).length} categorías creadas`);

    // Insert products
    let index = 0;
    for (const product of coffeeShopProducts) {
      const categoryId = categoryMap[product.category];
      await db.queryClient(
        client,
        "INSERT INTO products (name, stock, cost_price, price, category_id, is_active, display_order) VALUES (?, ?, ?, ?, ?, 1, ?)",
        [product.name, product.stock, product.cost, product.price, categoryId, index++]
      );
    }

    console.log(`✅ ${coffeeShopProducts.length} productos insertados`);
  });
};

// Main execution
(async () => {
  try {
    await seedProducts();
    console.log("\n✨ Seed completado exitosamente");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error en seed:", error.message);
    process.exit(1);
  }
})();
