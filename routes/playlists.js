import express from "express";
import sql from "mssql";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";

const router = express.Router();

// All playlists
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const playlists = await queryDB("SELECT * FROM Playlists");
    res.json(playlists);
  })
);

// All playlist-video relationships
router.get(
  "/videos",
  asyncHandler(async (req, res) => {
    const rows = await queryDB(`
      SELECT pv.*, v.youtube_key, g.tenor_key
      FROM PlaylistVideos pv
      LEFT JOIN Videos v ON pv.video_id = v.id
      LEFT JOIN Gifs g ON pv.gif_id = g.id
    `);
    res.json(rows);
  })
);

// Videos for a specific playlist
router.get(
  "/:id/videos",
  asyncHandler(async (req, res) => {
    const playlistId = parseInt(req.params.id, 10);
    if (isNaN(playlistId))
      return res.status(400).json({ error: "Invalid playlist ID" });

    const rows = await queryDB(
      `
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
      `,
      [["playlistId", playlistId, sql.Int]]
    );

    res.json({
      playlist_id: playlistId,
      video_count: rows.length,
      videos: rows,
    });
  })
);

export default router;
