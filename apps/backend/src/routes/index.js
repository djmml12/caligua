import { Router } from "express";
import authRoutes         from "./auth.routes.js";
import productRoutes      from "./products.routes.js";
import categoryRoutes     from "./categories.routes.js";
import salesRoutes        from "./sales.routes.js";
import ordersRoutes       from "./orders.routes.js";
import reportsRoutes      from "./reports.routes.js";
import usersRoutes        from "./users.routes.js";
import rolesRoutes        from "./roles.routes.js";
import settingsRoutes     from "./settings.routes.js";
import printRoutes        from "./print.routes.js";
import reservationsRoutes from "./reservations.routes.js";

const router = Router();

router.use("/auth",         authRoutes);
router.use("/products",     productRoutes);
router.use("/categories",   categoryRoutes);
router.use("/sales",        salesRoutes);
router.use("/orders",       ordersRoutes);
router.use("/reports",      reportsRoutes);
router.use("/users",        usersRoutes);
router.use("/roles",        rolesRoutes);
router.use("/settings",     settingsRoutes);
router.use("/print",        printRoutes);
router.use("/reservations", reservationsRoutes);

export default router;
