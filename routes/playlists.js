import express from "express";
import sql from "mssql";
import { getPool } from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query("SELECT * FROM Playlists");
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Playlists endpoint error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/:id/videos", async (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId))
    return res.status(400).json({ error: "Invalid playlist ID" });

  try {
    const pool = await getPool();
    const result = await pool.request().input("playlistId", sql.Int, playlistId)
      .query(`
        SELECT 
          v.id AS video_id,
          v.youtube_key,
          v.title AS video_title,
          g.tenor_key,
          g.title AS gif_title,
          pv.position,
          pv.added_at
        FROM PlaylistVideos pv
        INNER JOIN Videos v ON pv.video_id = v.id
        LEFT JOIN Gifs g ON pv.gif_id = g.id
        WHERE pv.playlist_id = @playlistId
        ORDER BY pv.position ASC
      `);

    res.json({
      playlist_id: playlistId,
      video_count: result.recordset.length,
      videos: result.recordset,
    });
  } catch (err) {
    console.error("❌ Playlist video lookup error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/videos", async (req, res) => {
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
