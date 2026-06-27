import { Router } from "express";
import { printReceipt, printSummary, printKitchenTicket, printTest, printReservation } from "../controllers/print.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/receipt",        authMiddleware, printReceipt);
router.post("/summary",        authMiddleware, printSummary);
router.post("/kitchen-ticket", authMiddleware, printKitchenTicket);
router.post("/test",           authMiddleware, printTest);
router.post("/reservation",    authMiddleware, printReservation);

export default router;
