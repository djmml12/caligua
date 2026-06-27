import { Router } from "express";
import {
  getDailyReport,
  getCashierReport,
  getDailyCashierReport,
  getCashierRangeReport,
  getCanceledSalesReport,
  exportCashierRangeReport,
  getDashboardSummary,
  salesReport,
  exportSalesRangeReport,
  getTodayCashierReport,
  getInventoryReport,
  exportInventoryReport,
  exportInventoryExcel,
  getInventoryMetrics,
  sendInventoryReportEmail,
  generateSaleReceiptPdf,
  getTodayLogoutSummary,
  sendTodayLogoutSummaryEmail,
  sendSalesRangeReportEmail,
} from "../controllers/reports.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = Router();

router.get("/dashboard", authMiddleware, authorize("admin"), getDashboardSummary);
router.get("/sales", authMiddleware, authorize("admin"), salesReport);
router.get("/sales/export", authMiddleware, authorize("admin"), exportSalesRangeReport);
router.post("/sales/email", authMiddleware, authorize("admin"), sendSalesRangeReportEmail);
router.get("/sale/:id/receipt", authMiddleware, generateSaleReceiptPdf);
router.get("/logout-summary/today", authMiddleware, getTodayLogoutSummary);
router.post("/logout-summary/email", authMiddleware, sendTodayLogoutSummaryEmail);
router.get("/daily", authMiddleware, authorize("admin"), getDailyReport);
router.get("/cashiers", authMiddleware, authorize("admin"), getCashierReport);
router.get("/cashiers/daily", authMiddleware, authorize("admin"), getDailyCashierReport);
router.get("/cashiers/today", authMiddleware, authorize("admin"), getTodayCashierReport);
router.get("/cashiers/range", authMiddleware, authorize("admin"), getCashierRangeReport);
router.get("/cashiers/range/export", authMiddleware, authorize("admin"), exportCashierRangeReport);
router.get("/cashiers/range/export/excel", authMiddleware, authorize("admin"), exportCashierRangeReport);
router.get("/cancellations", authMiddleware, authorize("admin"), getCanceledSalesReport);
router.get("/inventory", authMiddleware, authorize("admin", "supervisor"), getInventoryReport);
router.get("/inventory/export", authMiddleware, authorize("admin", "supervisor"), exportInventoryReport);
router.get("/inventory/export/excel", authMiddleware, authorize("admin", "supervisor"), exportInventoryExcel);
router.post("/inventory/email", authMiddleware, authorize("admin", "supervisor"), sendInventoryReportEmail);
router.get("/inventory/metrics", authMiddleware, authorize("admin"), getInventoryMetrics);

export default router;
