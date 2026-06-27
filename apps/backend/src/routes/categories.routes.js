import { Router } from "express";
import {
  getCategories,
  createCategory,
  updateCategory,
  deactivateCategory,
  activateCategory,
  deleteCategory,
  reorderCategories,
  updatePrinterTargets,
} from "../controllers/categories.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = Router();

router.get("/", authMiddleware, getCategories);
router.patch("/reorder", authMiddleware, authorize("admin"), reorderCategories);
router.patch("/printer-targets", authMiddleware, authorize("admin"), updatePrinterTargets);
router.post("/", authMiddleware, authorize("admin"), createCategory);
router.put("/:id", authMiddleware, authorize("admin"), updateCategory);
router.patch("/:id/deactivate", authMiddleware, authorize("admin"), deactivateCategory);
router.patch("/:id/activate", authMiddleware, authorize("admin"), activateCategory);
router.delete("/:id", authMiddleware, authorize("admin"), deleteCategory);

export default router;
