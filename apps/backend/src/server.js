import "dotenv/config";
import app from "./app.js";
import { initDB } from "./config/db.init.js";
import { closeDatabase } from "./config/db.js";
import { startOutboxWorker, stopOutboxWorker } from "./services/email-outbox.service.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
let shuttingDown = false;

async function startServer() {
  try {
    console.log("🟢 Iniciando servidor...");

    await initDB();
    startOutboxWorker();

    const server = app.listen(PORT, HOST, () => {
      console.log("🔥 SERVER CORRECTO EJECUTÁNDOSE 🔥");
      console.log(`🔥 Backend POS corriendo en ${HOST}:${PORT}`);
      console.log(`🌐 http://localhost:${PORT}`);
    });

    server.requestTimeout  = 30000;
    server.headersTimeout  = 35000;
    server.keepAliveTimeout = 15000;

    const shutdown = (signal = "manual") => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log("\n🛑 Cerrando servidor...");

      server.close(async () => {
        try {
          stopOutboxWorker();
          await closeDatabase();
        } catch (error) {
          console.error("❌ Error cerrando base de datos:", error);
        }
        console.log(`✅ Servidor detenido correctamente (${signal})`);
        process.exit(0);
      });

      setTimeout(() => {
        console.error("⚠️ Cierre forzado por timeout");
        process.exit(1);
      }, 8000).unref();
    };

    process.on("SIGINT",  () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    process.on("unhandledRejection", (reason) => {
      console.error("❌ Unhandled Rejection:", reason);
    });

    process.on("uncaughtException", (error) => {
      console.error("❌ Uncaught Exception:", error);
    });
  } catch (error) {
    console.error("❌ Error iniciando servidor:", error);
    process.exit(1);
  }
}

startServer();
