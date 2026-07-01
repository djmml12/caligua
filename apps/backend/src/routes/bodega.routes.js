import { Router } from "express";
import {
  getInsumos, createInsumo, updateInsumo, deleteInsumo,
  registrarCompra, getCompras,
  ajustarStock, getMovimientos,
  getReceta, setReceta,
  getProductosConTipo,
  exportBodega,
} from "../controllers/bodega.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = Router();

const canBodega = authorize("admin", "supervisor");

// Export
router.get   ("/export",                authMiddleware, canBodega,          exportBodega);

// Insumos
router.get   ("/insumos",               authMiddleware, canBodega,          getInsumos);
router.post  ("/insumos",               authMiddleware, authorize("admin"),  createInsumo);
router.put   ("/insumos/:id",           authMiddleware, authorize("admin"),  updateInsumo);
router.delete("/insumos/:id",           authMiddleware, authorize("admin"),  deleteInsumo);

// Compras y movimientos
router.post  ("/insumos/:id/compra",      authMiddleware, canBodega, registrarCompra);
router.get   ("/insumos/:id/compras",     authMiddleware, canBodega, getCompras);
router.post  ("/insumos/:id/ajuste",      authMiddleware, canBodega, ajustarStock);
router.get   ("/insumos/:id/movimientos", authMiddleware, canBodega, getMovimientos);

// Recetas
router.get   ("/productos",             authMiddleware, canBodega,          getProductosConTipo);
router.get   ("/receta/:producto_id",   authMiddleware, canBodega,          getReceta);
router.put   ("/receta/:producto_id",   authMiddleware, authorize("admin"),  setReceta);

export default router;
