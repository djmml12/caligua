import { Router } from "express";
import { getUsers, createUser, updateUser } from "../controllers/users.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = Router();

router.get("/", authMiddleware, authorize("admin"), getUsers);
router.post("/", authMiddleware, authorize("admin"), createUser);
router.put("/:id", authMiddleware, authorize("admin"), updateUser);

export default router;
