import { initDB } from "../config/db.init.js";

async function run() {
  try {
    await initDB();
    console.log("🎉 Base de datos lista");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error inicializando DB:", error);
    process.exit(1);
  }
}

run();
