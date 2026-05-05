import { Router } from "express";
import { getOrders, createOrder, updateOrder, getOrderById } from "../controllers/orders.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/",    authMiddleware, getOrders);
router.post("/",   authMiddleware, createOrder);
router.put("/:id", authMiddleware, updateOrder);
router.get("/:id", authMiddleware, getOrderById);

export default router;
