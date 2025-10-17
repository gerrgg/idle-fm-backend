import express from "express";
import sql from "mssql";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";
import { auth } from "../middleware/auth.js";

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

router.post('/',
  auth,
  asyncHandler(async (req, res) => {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const result = await queryDB(
      `
      INSERT INTO Playlists (title, user_id)
      OUTPUT INSERTED.id, INSERTED.title, INSERTED.created_at
      VALUES (@title, @userId)
      `,
      [
        ["title", title, sql.NVarChar],
        ["userId", req.user.id, sql.Int],
      ]
    );

    res.status(201).json(result[0]);
  })
);

router.post("/:id/videos",
  auth,
  asyncHandler(async (req, res) => {
    const playlistId = Number(req.params.id);
    if (isNaN(playlistId)) return res.status(400).json({ error: "Invalid playlist ID" });

    const ownerId = req.user.id;
    const { youtube_key, title, tenor_key, gif_title, position } = req.body;

    if (!youtube_key)
      return res.status(400).json({ error: "youtube_key is required" });

    // Confirm playlist ownership
    const playlist = await queryDB(
      "SELECT id, user_id FROM Playlists WHERE id = @PlaylistId",
      [["PlaylistId", playlistId, sql.Int]]
    );
    if (!playlist.length) return res.status(404).json({ error: "Playlist not found" });
    if (playlist[0].user_id !== ownerId) return res.status(403).json({ error: "Forbidden" });

    // --- VIDEO: find or create ---
    let videoId;
    const videoExisting = await queryDB(
      "SELECT id FROM Videos WHERE youtube_key = @Key",
      [["Key", youtube_key, sql.NVarChar]]
    );

    if (videoExisting.length) {
      videoId = videoExisting[0].id;
    } else {
      const insertedVideo = await queryDB(
        `INSERT INTO Videos (youtube_key, title)
         OUTPUT INSERTED.id
         VALUES (@Key, @Title)`,
        [
          ["Key", youtube_key, sql.NVarChar],
          ["Title", title || null, sql.NVarChar],
        ]
      );
      videoId = insertedVideo[0].id;
    }

    // --- GIF: optional find or create ---
    let gifId = null;
    if (tenor_key) {
      const gifExisting = await queryDB(
        "SELECT id FROM Gifs WHERE tenor_key = @Key",
        [["Key", tenor_key, sql.NVarChar]]
      );

      if (gifExisting.length) {
        gifId = gifExisting[0].id;
      } else {
        const insertedGif = await queryDB(
          `INSERT INTO Gifs (tenor_key, title)
           OUTPUT INSERTED.id
           VALUES (@Key, @Title)`,
          [
            ["Key", tenor_key, sql.NVarChar],
            ["Title", gif_title || null, sql.NVarChar],
          ]
        );
        gifId = insertedGif[0].id;
      }
    }

    // --- Determine position if not provided ---
    let finalPosition;
    if (position === undefined || position === null || position === "" || Number(position) <= 0) {
      const last = await queryDB(
        "SELECT ISNULL(MAX(position), 0) AS max_pos FROM PlaylistVideos WHERE playlist_id = @PlaylistId",
        [["PlaylistId", playlistId, sql.Int]]
      );
      finalPosition = last[0].max_pos + 1;
    } else {
      finalPosition = Number(position);
    }


    // --- Link to playlist ---
    const result = await queryDB(
      `INSERT INTO PlaylistVideos (playlist_id, video_id, gif_id, position)
       OUTPUT INSERTED.playlist_id, INSERTED.video_id, INSERTED.gif_id, INSERTED.position
       VALUES (@PlaylistId, @VideoId, @GifId, @Position)`,
      [
        ["PlaylistId", playlistId, sql.Int],
        ["VideoId", videoId, sql.Int],
        ["GifId", gifId, sql.Int],
        ["Position", finalPosition, sql.Int],
      ]
    );

    res.status(201).json(result[0]);
  })
);

router.delete("/:id/videos/:videoId",
  auth,
  asyncHandler(async (req, res) => {
    const playlistId = Number(req.params.id);
    const videoId = Number(req.params.videoId);
    const ownerId = req.user.id;

    if (isNaN(playlistId) || isNaN(videoId))
      return res.status(400).json({ error: "Invalid IDs" });

    // Confirm playlist ownership
    const playlist = await queryDB(
      "SELECT user_id FROM Playlists WHERE id = @PlaylistId",
      [["PlaylistId", playlistId, sql.Int]]
    );
    if (!playlist.length)
      return res.status(404).json({ error: "Playlist not found" });
    if (playlist[0].user_id !== ownerId)
      return res.status(403).json({ error: "Forbidden" });

    // Delete video link from playlist
    const deleted = await queryDB(
      `DELETE FROM PlaylistVideos
       OUTPUT DELETED.playlist_id, DELETED.video_id
       WHERE playlist_id = @PlaylistId AND video_id = @VideoId`,
      [
        ["PlaylistId", playlistId, sql.Int],
        ["VideoId", videoId, sql.Int],
      ]
    );

    if (!deleted.length)
      return res.status(404).json({ error: "Video not found in playlist" });

    res.json({ message: "Video removed", removed: deleted[0] });
  })
);




export default router;
