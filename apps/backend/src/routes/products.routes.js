import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deactivateProduct,
  activateProduct,
  deleteProduct,
  addStock,
  reorderProducts,
} from "../controllers/product.controller.js";

const router = Router();

router.patch("/reorder", authMiddleware, authorize("admin"), reorderProducts);
router.get("/", authMiddleware, getProducts);
router.get("/:id", authMiddleware, getProductById);
router.post("/", authMiddleware, authorize("admin"), createProduct);
router.put("/:id", authMiddleware, authorize("admin"), updateProduct);
router.patch("/:id", authMiddleware, authorize("admin"), updateProduct);
router.delete("/:id", authMiddleware, authorize("admin"), deleteProduct);
router.patch("/:id/deactivate", authMiddleware, authorize("admin"), deactivateProduct);
router.patch("/:id/activate", authMiddleware, authorize("admin"), activateProduct);
router.patch("/:id/add-stock", authMiddleware, authorize("admin", "supervisor"), addStock);

export default router;
