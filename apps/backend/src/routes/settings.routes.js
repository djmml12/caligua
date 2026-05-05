import { Router } from "express";
import {
  getPrinterConfig,
  updatePrinterConfig,
  getBarPrinterConfig,
  updateBarPrinterConfig,
  getPrinterMode,
  updatePrinterMode,
  getTipPercentage,
  updateTipPercentage,
  getEmailAlertConfig,
  updateEmailAlertConfig,
  sendEmailAlertTest,
  getEmailLogs,
  getTouchKeyboardConfig,
  updateTouchKeyboardConfig,
  getStockAlertThresholds,
  updateStockAlertThresholds,
} from "../controllers/settings.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = Router();

router.get("/printer", authMiddleware, getPrinterConfig);
router.put("/printer", authMiddleware, authorize("admin"), updatePrinterConfig);
router.post("/printer", authMiddleware, authorize("admin"), updatePrinterConfig);

router.get("/printer-bar", authMiddleware, getBarPrinterConfig);
router.put("/printer-bar", authMiddleware, authorize("admin"), updateBarPrinterConfig);
router.post("/printer-bar", authMiddleware, authorize("admin"), updateBarPrinterConfig);

router.get("/printer-mode", authMiddleware, getPrinterMode);
router.put("/printer-mode", authMiddleware, authorize("admin"), updatePrinterMode);
router.post("/printer-mode", authMiddleware, authorize("admin"), updatePrinterMode);

router.get("/tip", authMiddleware, getTipPercentage);
router.post("/tip", authMiddleware, authorize("admin"), updateTipPercentage);
router.put("/tip", authMiddleware, authorize("admin"), updateTipPercentage);
router.get("/email-alerts", authMiddleware, authorize("admin"), getEmailAlertConfig);
router.post("/email-alerts", authMiddleware, authorize("admin"), updateEmailAlertConfig);
router.put("/email-alerts", authMiddleware, authorize("admin"), updateEmailAlertConfig);
router.post("/email-alerts/test", authMiddleware, authorize("admin"), sendEmailAlertTest);
router.get("/email-alerts/logs", authMiddleware, authorize("admin"), getEmailLogs);
router.get("/touch-keyboard", authMiddleware, getTouchKeyboardConfig);
router.post("/touch-keyboard", authMiddleware, authorize("admin"), updateTouchKeyboardConfig);
router.put("/touch-keyboard", authMiddleware, authorize("admin"), updateTouchKeyboardConfig);
router.get("/stock-thresholds", authMiddleware, getStockAlertThresholds);
router.post("/stock-thresholds", authMiddleware, authorize("admin"), updateStockAlertThresholds);
router.put("/stock-thresholds", authMiddleware, authorize("admin"), updateStockAlertThresholds);

export default router;
