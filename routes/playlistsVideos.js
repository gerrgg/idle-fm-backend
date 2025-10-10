import express from "express";
import { getPool } from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT pv.*, v.youtube_key, g.tenor_key
      FROM PlaylistVideos pv
      LEFT JOIN Videos v ON pv.video_id = v.id
      LEFT JOIN Gifs g ON pv.gif_id = g.id
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ PlaylistVideos endpoint error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
