import express from "express";
import sql from "mssql";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";
import { auth } from "../middleware/auth.js";
import { generateUniqueTitle } from "../utils/playlistHelpers.js";
import { dbConfig } from "../config/dbConfig.js";

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

    const rows = await queryDB(
      `
      SELECT 
        p.id,
        p.title,
        p.description,
        p.created_at,
        p.is_public,
        p.image,
        p.user_id AS owner_id,
        u.username as owner_username,
        (
          SELECT 
            v.id,
            v.youtube_key,
            v.duration,
            v.title,
            pv.added_at,
            v.channel_title,
            JSON_QUERY(v.thumbnails) AS thumbnails
          FROM PlaylistVideos pv
          INNER JOIN Videos v ON pv.video_id = v.id
          WHERE pv.playlist_id = p.id
          ORDER BY pv.position
          FOR JSON PATH
        ) AS videos,

        (
          SELECT 
            t.id,
            t.name
          FROM PlaylistTags pt
          INNER JOIN Tags t ON pt.tag_id = t.id
          WHERE pt.playlist_id = p.id
          ORDER BY t.name ASC
          FOR JSON PATH
        ) AS tags

      FROM Playlists p
      JOIN Users u ON p.user_id = u.id
      WHERE p.id = @playlistId
      `,
      [["playlistId", playlistId, sql.Int]]
    );

    if (!rows.length) return res.status(404).json({ error: "Not found" });

    const r = rows[0];

    const videos = r.videos ? JSON.parse(r.videos) : [];
    const videoIds = videos.map((v) => v.id);

    const tags = r.tags ? JSON.parse(r.tags) : [];
    const tagIds = tags.map((t) => t.id);

    res.json({
      playlist: {
        id: r.id,
        title: r.title,
        description: r.description,
        created_at: r.created_at,
        is_public: r.is_public,
        image: r.image,
        owner_id: r.owner_id,
        owner_username: r.owner_username,
        videoIds,
        tagIds,
      },
      videos,
      tags,
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

// PUT /playlists/:id/reorder
router.put(
  "/:id/reorder",
  asyncHandler(async (req, res) => {
    const playlistId = parseInt(req.params.id, 10);
    const { videoIds } = req.body; // array of IDs: [201, 105, 300, ...]

    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return res
        .status(400)
        .json({ error: "videoIds must be a non-empty array" });
    }

    const tx = new sql.Transaction();

    try {
      await tx.begin();

      // One single UPDATE using OPENJSON
      const request = new sql.Request(tx);
      await request
        .input("playlistId", sql.Int, playlistId)
        .input("json", sql.NVarChar, JSON.stringify(videoIds)).query(`
          ;WITH Positions AS (
            SELECT 
              value AS videoId,
              ROW_NUMBER() OVER (ORDER BY [key]) - 1 AS pos
            FROM OPENJSON(@json)
          )
          UPDATE pv
          SET pv.position = p.pos
          FROM PlaylistVideos pv
          INNER JOIN Positions p
            ON p.videoId = pv.video_id
          WHERE pv.playlist_id = @playlistId;
        `);

      await tx.commit();

      res.json({
        success: true,
        playlistId,
        newOrder: videoIds,
      });
    } catch (err) {
      console.error("REORDER ERROR:", err);
      await tx.rollback();
      res.status(500).json({
        error: "Database error",
        details: err.message,
      });
    }
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

    // Check ownership
    const playlist = await queryDB(
      "SELECT user_id FROM Playlists WHERE id = @PlaylistId",
      [["PlaylistId", playlistId, sql.Int]]
    );

    if (!playlist.length) return res.status(404).json({ error: "Not found" });

    if (playlist[0].user_id !== ownerId)
      return res.status(403).json({ error: "Forbidden" });

    // Find or create Video
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

    // Determine next position
    const last = await queryDB(
      "SELECT ISNULL(MAX(position),0) AS max_pos FROM PlaylistVideos WHERE playlist_id = @PlaylistId",
      [["PlaylistId", playlistId, sql.Int]]
    );

    const position = last[0].max_pos + 1;

    // Insert into PlaylistVideos
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

    const link = linkRows[0];

    // Fetch video metadata
    const videoRows = await queryDB(`SELECT * FROM Videos WHERE id = @id`, [
      ["id", videoId, sql.Int],
    ]);

    const video = videoRows[0];

    // If playlist has no image yet, set one
    let playlistImage = playlist[0].image;

    if (!playlistImage) {
      const thumbs = JSON.parse(video.thumbnails || "{}");
      playlistImage = thumbs.medium?.url || thumbs.default?.url || null;

      if (playlistImage) {
        await queryDB(
          `UPDATE Playlists SET image = @Image WHERE id = @PlaylistId`,
          [
            ["Image", playlistImage, sql.NVarChar],
            ["PlaylistId", playlistId, sql.Int],
          ]
        );
      }
    }

    // Return final unified object
    res.json({
      id: video.id,
      youtube_key: video.youtube_key,
      title: video.title,
      thumbnails: JSON.parse(video.thumbnails || "{}"),
      channel_title: video.channel_title,
      duration: video.duration,
      added_at: link.added_at,
      position: link.position,
      playlist_image: playlistImage,
    });
  })
);

router.delete(
  "/:playlistId/videos/:videoId",
  auth,
  asyncHandler(async (req, res) => {
    const playlistId = Number(req.params.playlistId);
    const videoId = Number(req.params.videoId);
    const userId = req.user.id;

    if (isNaN(playlistId) || isNaN(videoId)) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    // 1. Validate ownership
    const ownerRow = await queryDB(
      `SELECT user_id FROM Playlists WHERE id = @pid`,
      [["pid", playlistId, sql.Int]]
    );

    if (!ownerRow.length) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    if (ownerRow[0].user_id !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // 2. Delete join row
    const deletedRows = await queryDB(
      `
      DELETE FROM PlaylistVideos
      OUTPUT DELETED.playlist_id, DELETED.video_id, DELETED.position
      WHERE playlist_id = @pid AND video_id = @vid
      `,
      [
        ["pid", playlistId, sql.Int],
        ["vid", videoId, sql.Int],
      ]
    );

    if (!deletedRows.length) {
      return res.status(404).json({ error: "Video not found in playlist" });
    }

    // 3. Reindex remaining positions
    await queryDB(
      `
      WITH Ordered AS (
        SELECT video_id, ROW_NUMBER() OVER (ORDER BY position) - 1 AS newPos
        FROM PlaylistVideos
        WHERE playlist_id = @pid
      )
      UPDATE pv
      SET pv.position = o.newPos
      FROM PlaylistVideos pv
      JOIN Ordered o ON pv.video_id = o.video_id
      WHERE pv.playlist_id = @pid
      `,
      [["pid", playlistId, sql.Int]]
    );

    res.json({
      message: "Video removed",
      playlistId,
      videoId,
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

    await queryDB(`DELETE FROM PlaylistTags WHERE playlist_id = @PlaylistId`, [
      ["PlaylistId", playlistId, sql.Int],
    ]);

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
      playlist: {
        id: updatedPlaylist[0].id,
        title: updatedPlaylist[0].title,
        description: updatedPlaylist[0].description,
        is_public: updatedPlaylist[0].is_public,
        image: updatedPlaylist[0].image,
        tagIds: tagRows.map((t) => t.id), // FIXED — returns only IDs
      },
      tags: tagRows, // frontend normalizer needs this
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

router.put(
  "/:id/image",
  auth,
  asyncHandler(async (req, res) => {
    const playlistId = Number(req.params.id);
    const ownerId = req.user.id;
    const { image } = req.body;

    if (!playlistId || !image) {
      return res.status(400).json({ error: "Invalid image update request" });
    }

    const playlist = await queryDB(
      "SELECT user_id FROM Playlists WHERE id = @id",
      [["id", playlistId, sql.Int]]
    );

    if (!playlist.length) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    if (playlist[0].user_id !== ownerId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await queryDB("UPDATE Playlists SET image = @image WHERE id = @id", [
      ["image", image, sql.NVarChar],
      ["id", playlistId, sql.Int],
    ]);

    res.json({ playlistId, image });
  })
);

export default router;
