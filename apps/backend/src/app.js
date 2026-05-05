import express from "express";
import cors from "cors";

import categoriesRoutes from "./routes/categories.routes.js";
import productsRoutes   from "./routes/products.routes.js";
import reportsRoutes    from "./routes/reports.routes.js";
import authRoutes       from "./routes/auth.routes.js";
import salesRoutes      from "./routes/sales.routes.js";
import ordersRoutes     from "./routes/orders.routes.js";
import usersRoutes      from "./routes/users.routes.js";
import rolesRoutes      from "./routes/roles.routes.js";
import settingsRoutes   from "./routes/settings.routes.js";
import printRoutes      from "./routes/print.routes.js";

const app = express();

app.use(cors());
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Log de cada petición entrante
app.use((req, _res, next) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  console.log(`[REQ] ${new Date().toISOString()} | ${req.method} ${req.originalUrl} | IP: ${ip}`);
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/sales",   salesRoutes);
app.use("/api/orders",  ordersRoutes);
app.use("/api/print",   printRoutes);
app.use("/api/users",   usersRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/settings", settingsRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "OK" });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, req, res, next) => {
  console.error("🔥 SERVER ERROR:", err);

  res.status(500).json({
    success: false,
    message: "Error interno del servidor",
  });
});

export default app;
