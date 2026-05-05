import express from "express";
import db from "../config/db.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", authMiddleware, async (req, res) => {
  try {
    const result = await db.query("SELECT id, name FROM roles ORDER BY id");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo roles" });
  }
});

export default router;
