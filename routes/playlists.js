import express from "express";
import sql from "mssql";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";
import { auth } from "../middleware/auth.js";
import { generateUniqueTitle } from "../utils/playlistHelpers.js";

const router = express.Router();

// All playlists
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const playlists = await queryDB("SELECT * FROM Playlists");
    res.json(playlists);
  })
);

// Get a specific playlist by ID
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const playlistId = parseInt(req.params.id, 10);
    if (isNaN(playlistId))
      return res.status(400).json({ error: "Invalid playlist ID" });

    // Fetch base playlist
    const playlistRows = await queryDB(
      "SELECT * FROM Playlists WHERE id = @playlistId",
      [["playlistId", playlistId, sql.Int]]
    );

    if (playlistRows.length === 0)
      return res.status(404).json({ error: "Playlist not found" });

    const playlist = playlistRows[0];

    // Fetch tags
    const tagRows = await queryDB(
      `
      SELECT t.id, t.name
      FROM PlaylistTags pt
      INNER JOIN Tags t ON pt.tag_id = t.id
      WHERE pt.playlist_id = @playlistId
      ORDER BY t.name ASC
      `,
      [["playlistId", playlistId, sql.Int]]
    );

    // Fetch videos
    const videoRows = await queryDB(
      `
    SELECT
      pv.position,
      pv.added_at,
      v.youtube_key,
      v.title,
      v.thumbnails,
      v.channel_title,
      v.duration
    FROM PlaylistVideos pv
    INNER JOIN Videos v ON pv.video_id = v.id
    WHERE pv.playlist_id = @playlistId
    ORDER BY pv.position ASC
  `,
      [["playlistId", playlistId, sql.Int]]
    );

    // Convert DB rows into the unified frontend shape
    const hydratedVideos = videoRows.map((v) => ({
      id: v.youtube_key,
      youtube_key: v.youtube_key,
      title: v.title,
      thumbnails: JSON.parse(v.thumbnails || "{}"),
      channel_title: v.channel_title,
      duration: v.duration,
      position: v.position,
      added_at: v.added_at,
    }));

    res.json({
      ...playlist,
      tags: tagRows,
      videos: hydratedVideos,
      tag_count: tagRows.length,
      video_count: videoRows.length,
    });
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

// Create a new playlist
router.post(
  "/",
  auth,
  asyncHandler(async (req, res) => {
    const { title, description = null, is_public = true, tags = [] } = req.body;

    if (!title) return res.status(400).json({ error: "Title is required" });

    const titleUnique = await generateUniqueTitle(req.user.id, title);

    // 1. Insert playlist
    const playlistResult = await queryDB(
      `
      INSERT INTO Playlists (title, description, is_public, user_id)
      OUTPUT INSERTED.id, INSERTED.title, INSERTED.description, INSERTED.is_public, INSERTED.created_at
      VALUES (@titleUnique, @description, @is_public, @userId)
      `,
      [
        ["titleUnique", titleUnique, sql.NVarChar],
        ["description", description, sql.NVarChar],
        ["is_public", is_public, sql.Bit],
        ["userId", req.user.id, sql.Int],
      ]
    );

    const playlist = playlistResult[0];

    // 2. Handle tags if provided
    if (tags.length > 0) {
      for (const tag of tags) {
        let tagId;
        let tagName = null;

        if (typeof tag === "object" && tag.id) {
          // Existing tag object
          tagId = tag.id;
        } else if (typeof tag === "object" && tag.name) {
          // Object missing id, insert or find by name
          tagName = tag.name.trim().toLowerCase();
        } else if (typeof tag === "number") {
          // Already an ID
          tagId = tag;
        } else if (typeof tag === "string") {
          // Raw string name
          tagName = tag.trim().toLowerCase();
        }

        // Resolve tagId if name provided
        if (!tagId && tagName) {
          const tagLookup = await queryDB(
            `SELECT id FROM Tags WHERE name = @tagName`,
            [["tagName", tagName, sql.NVarChar]]
          );

          if (tagLookup.length > 0) {
            tagId = tagLookup[0].id;
          } else {
            const insertTag = await queryDB(
              `INSERT INTO Tags (name) OUTPUT INSERTED.id VALUES (@tagName)`,
              [["tagName", tagName, sql.NVarChar]]
            );
            tagId = insertTag[0].id;
          }
        }

        // Link tag to playlist
        await queryDB(
          `INSERT INTO PlaylistTags (playlist_id, tag_id)
       VALUES (@playlistId, @tagId)`,
          [
            ["playlistId", playlist.id, sql.Int],
            ["tagId", tagId, sql.Int],
          ]
        );
      }
    }

    res.status(201).json({
      ...playlist,
      tags,
    });
  })
);

// Update a specific playlist by ID
router.post(
  "/:id/videos",
  auth,
  asyncHandler(async (req, res) => {
    const playlistId = Number(req.params.id);
    const ownerId = req.user.id;

    const { youtube_key, title } = req.body;

    if (!youtube_key)
      return res.status(400).json({ error: "youtube_key is required" });

    const playlist = await queryDB(
      "SELECT user_id FROM Playlists WHERE id = @PlaylistId",
      [["PlaylistId", playlistId, sql.Int]]
    );

    if (!playlist.length) return res.status(404).json({ error: "Not found" });
    if (playlist[0].user_id !== ownerId)
      return res.status(403).json({ error: "Forbidden" });

    // Video find-or-create
    const existing = await queryDB(
      "SELECT id FROM Videos WHERE youtube_key = @Key",
      [["Key", youtube_key, sql.NVarChar]]
    );

    let videoId;
    if (existing.length) {
      videoId = existing[0].id;
    } else {
      const inserted = await queryDB(
        `INSERT INTO Videos (youtube_key, title)
         OUTPUT INSERTED.id
         VALUES (@Key, @Title)`,
        [
          ["Key", youtube_key, sql.NVarChar],
          ["Title", title || null, sql.NVarChar],
        ]
      );
      videoId = inserted[0].id;
    }

    // Compute next position
    const last = await queryDB(
      "SELECT ISNULL(MAX(position),0) AS max_pos FROM PlaylistVideos WHERE playlist_id = @PlaylistId",
      [["PlaylistId", playlistId, sql.Int]]
    );

    const position = last[0].max_pos + 1;

    // Link video to playlist
    const linkRows = await queryDB(
      `INSERT INTO PlaylistVideos (playlist_id, video_id, position)
       OUTPUT INSERTED.*
       VALUES (@PlaylistId, @VideoId, @Position)`,
      [
        ["PlaylistId", playlistId, sql.Int],
        ["VideoId", videoId, sql.Int],
        ["Position", position, sql.Int],
      ]
    );

    // Link video to playlist (returns playlist_id, video_id, position)
    const link = linkRows[0];

    // Fetch full video metadata
    const videoRows = await queryDB(`SELECT * FROM Videos WHERE id = @id`, [
      ["id", link.video_id, sql.Int],
    ]);

    const video = videoRows[0];

    // Check if playlist already has an image
    const playlistData = await queryDB(
      `SELECT image FROM Playlists WHERE id = @PlaylistId`,
      [["PlaylistId", playlistId, sql.Int]]
    );

    if (!playlistData[0].image) {
      // Get a usable thumbnail
      const videoThumb =
        JSON.parse(video.thumbnails || "{}")?.medium?.url ||
        JSON.parse(video.thumbnails || "{}")?.default?.url ||
        null;

      if (videoThumb) {
        await queryDB(
          `UPDATE Playlists SET image = @Image WHERE id = @PlaylistId`,
          [
            ["Image", videoThumb, sql.NVarChar],
            ["PlaylistId", playlistId, sql.Int],
          ]
        );
      }
    }

    // Return unified object shape
    res.json({
      id: video.youtube_key,
      youtube_key: video.youtube_key,
      title: video.title,
      thumbnails: JSON.parse(video.thumbnails || "{}"),
      channel_title: video.channel_title,
      duration: video.duration,
      added_at: link.added_at,
      position: link.position,
      playlist_image: playlistData[0].image || "",
    });

    res.status(201).json(link[0]);
  })
);

// Delete a video from a playlist by YouTube key
router.delete(
  "/:id/videos/:youtubeKey",
  auth,
  asyncHandler(async (req, res) => {
    const playlistId = Number(req.params.id);
    const youtubeKey = req.params.youtubeKey;
    const ownerId = req.user.id;

    if (isNaN(playlistId) || !youtubeKey)
      return res.status(400).json({ error: "Invalid parameters" });

    // Confirm playlist ownership
    const playlist = await queryDB(
      "SELECT user_id FROM Playlists WHERE id = @PlaylistId",
      [["PlaylistId", playlistId, sql.Int]]
    );
    if (!playlist.length)
      return res.status(404).json({ error: "Playlist not found" });
    if (playlist[0].user_id !== ownerId)
      return res.status(403).json({ error: "Forbidden" });

    // Find the internal video_id by youtube_key
    const video = await queryDB(
      "SELECT id FROM Videos WHERE youtube_key = @Key",
      [["Key", youtubeKey, sql.NVarChar]]
    );
    if (!video.length)
      return res.status(404).json({ error: "Video not found in database" });

    const videoId = video[0].id;

    // Remove link from playlist
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

    res.json({
      message: "Video removed from playlist",
      removed: { playlist_id: playlistId, youtube_key: youtubeKey },
    });
  })
);

// Update playlist
router.put(
  "/:id",
  auth,
  asyncHandler(async (req, res) => {
    const { title, description = null, is_public = true, tags = [] } = req.body;
    const playlistId = Number(req.params.id);
    if (isNaN(playlistId)) return res.status(400).json({ error: "Invalid ID" });

    // --- Update playlist info ---
    await queryDB(
      `UPDATE Playlists
       SET title=@Title, description=@Description, is_public=@IsPublic
       WHERE id=@Id`,
      [
        ["Title", title, sql.NVarChar],
        ["Description", description, sql.NVarChar],
        ["IsPublic", is_public, sql.Bit],
        ["Id", playlistId, sql.Int],
      ]
    );

    // Step 1: Remove old relationships
    await queryDB(`DELETE FROM PlaylistTags WHERE playlist_id = @PlaylistId`, [
      ["PlaylistId", playlistId, sql.Int],
    ]);

    // Step 2: Recreate tag links
    for (const rawTag of tags) {
      const tagName =
        typeof rawTag === "object"
          ? rawTag.name.trim().toLowerCase()
          : String(rawTag).trim().toLowerCase();

      if (!tagName) continue;

      // Find or create tag
      const existing = await queryDB(
        `SELECT id FROM Tags WHERE name = @TagName`,
        [["TagName", tagName, sql.NVarChar]]
      );

      let tagId;
      if (existing.length > 0) {
        tagId = existing[0].id;
      } else {
        const inserted = await queryDB(
          `INSERT INTO Tags (name) OUTPUT INSERTED.id VALUES (@TagName)`,
          [["TagName", tagName, sql.NVarChar]]
        );
        tagId = inserted[0].id;
      }

      // Link tag to playlist
      await queryDB(
        `INSERT INTO PlaylistTags (playlist_id, tag_id)
         VALUES (@PlaylistId, @TagId)`,
        [
          ["PlaylistId", playlistId, sql.Int],
          ["TagId", tagId, sql.Int],
        ]
      );
    }

    // --- Return updated playlist with tags ---
    const updatedPlaylist = await queryDB(
      "SELECT * FROM Playlists WHERE id = @Id",
      [["Id", playlistId, sql.Int]]
    );

    const tagRows = await queryDB(
      `
      SELECT t.id, t.name
      FROM PlaylistTags pt
      INNER JOIN Tags t ON pt.tag_id = t.id
      WHERE pt.playlist_id = @PlaylistId
      ORDER BY t.name ASC
      `,
      [["PlaylistId", playlistId, sql.Int]]
    );

    res.json({
      ...updatedPlaylist[0],
      tags: tagRows,
      tag_count: tagRows.length,
      message: "Playlist updated successfully",
    });
  })
);

router.delete(
  "/:id",
  auth,
  asyncHandler(async (req, res) => {
    const playlistId = Number(req.params.id);
    if (isNaN(playlistId))
      return res.status(400).json({ error: "Invalid playlist ID" });

    // Confirm ownership
    const playlist = await queryDB(
      "SELECT user_id FROM Playlists WHERE id = @PlaylistId",
      [["PlaylistId", playlistId, sql.Int]]
    );
    if (!playlist.length)
      return res.status(404).json({ error: "Playlist not found" });
    if (playlist[0].user_id !== req.user.id)
      return res.status(403).json({ error: "Forbidden" });

    // Delete the playlist
    await queryDB("DELETE FROM Playlists WHERE id = @PlaylistId", [
      ["PlaylistId", playlistId, sql.Int],
    ]);

    res.json({ message: "Playlist deleted successfully" });
  })
);

export default router;
