import express from "express";
import { getPool } from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query("SELECT * FROM Users");
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Users endpoint error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
