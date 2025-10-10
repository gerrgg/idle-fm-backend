import express from "express";
import { getPool } from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query("SELECT * FROM Videos");
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Videos endpoint error:", err);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

export default router;
