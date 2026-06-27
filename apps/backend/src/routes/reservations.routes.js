import { Router } from "express";
import {
  createReservation,
  getReservations,
  getReservationById,
  updateReservation,
  deleteReservation,
} from "../controllers/reservations.controller.js";
import { authMiddleware }  from "../middlewares/auth.middleware.js";
import { authorize }       from "../middlewares/authorize.middleware.js";

const router = Router();

router.use(authMiddleware, authorize("admin"));

router.get(   "/",    getReservations);
router.post(  "/",    createReservation);
router.get(   "/:id", getReservationById);
router.put(   "/:id", updateReservation);
router.delete("/:id", deleteReservation);

export default router;
