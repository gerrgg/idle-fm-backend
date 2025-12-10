import express from "express";
import { searchYouTubeCached } from "../services/youtubeCache.js";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";
import sql from "mssql";
import { auth } from "../middleware/auth.js";

const router = express.Router();

/**
 * POST /admin/generate-playlist
 * Admin-only. Creates a public playlist from YouTube search results.
 */
router.post(
  "/generate-playlist",
  auth,
  asyncHandler(async (req, res) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { title, description, tags = [], videoLimit = 50 } = req.body;

    if (!title || tags.length === 0) {
      return res
        .status(400)
        .json({ error: "Title and at least one tag are required." });
    }

    // ----------------------------------------
    // 1. YouTube search
    // ----------------------------------------
    const searchQuery = [...tags, "music"].join(" ");
    const results = await searchYouTubeCached(searchQuery);

    const selected = results.slice(0, videoLimit);
    if (!selected.length) {
      return res.status(400).json({ error: "No videos found." });
    }

    const ownerId = 1; // Idle.fm / system account

    // ----------------------------------------
    // 2. Create playlist
    // ----------------------------------------
    const playlistRows = await queryDB(
      `
      INSERT INTO Playlists (title, description, is_public, user_id)
      OUTPUT INSERTED.*
      VALUES (@title, @desc, 1, @owner)
      `,
      [
        ["title", title, sql.NVarChar],
        ["desc", description ?? "", sql.NVarChar],
        ["owner", ownerId, sql.Int],
      ]
    );

    const playlist = playlistRows[0];

    // ----------------------------------------
    // 3. TAG LOGIC (find-or-create + link)
    // ----------------------------------------
    const tagIds = [];

    for (const rawTag of tags) {
      const tagName =
        typeof rawTag === "object"
          ? rawTag.name.trim().toLowerCase()
          : String(rawTag).trim().toLowerCase();

      if (!tagName) continue;

      // find or create tag
      const existing = await queryDB(`SELECT id FROM Tags WHERE name = @name`, [
        ["name", tagName, sql.NVarChar],
      ]);

      let tagId;
      if (existing.length > 0) {
        tagId = existing[0].id;
      } else {
        const inserted = await queryDB(
          `INSERT INTO Tags (name) OUTPUT INSERTED.id VALUES (@name)`,
          [["name", tagName, sql.NVarChar]]
        );
        tagId = inserted[0].id;
      }

      // link tag to playlist
      await queryDB(
        `
        INSERT INTO PlaylistTags (playlist_id, tag_id)
        VALUES (@pid, @tid)
        `,
        [
          ["pid", playlist.id, sql.Int],
          ["tid", tagId, sql.Int],
        ]
      );

      tagIds.push(tagId);
    }

    // ----------------------------------------
    // 4. Insert each Video + link to playlist
    // ----------------------------------------
    for (let i = 0; i < selected.length; i++) {
      const v = selected[i];

      // Upsert video
      const existing = await queryDB(
        "SELECT id FROM Videos WHERE youtube_key = @key",
        [["key", v.youtube_key, sql.NVarChar]]
      );

      let videoId;

      if (existing.length) {
        videoId = existing[0].id;
      } else {
        const inserted = await queryDB(
          `
          INSERT INTO Videos (youtube_key, title, thumbnails, channel_title, duration)
          OUTPUT INSERTED.id
          VALUES (@key, @title, @thumbs, @channel, @duration)
          `,
          [
            ["key", v.youtube_key, sql.NVarChar],
            ["title", v.title, sql.NVarChar],
            ["thumbs", JSON.stringify(v.thumbnails || {}), sql.NVarChar],
            ["channel", v.channel_title || null, sql.NVarChar],
            ["duration", v.duration, sql.NVarChar],
          ]
        );
        videoId = inserted[0].id;
      }

      // Link to playlist
      await queryDB(
        `
        INSERT INTO PlaylistVideos (playlist_id, video_id, position)
        VALUES (@pid, @vid, @pos)
        `,
        [
          ["pid", playlist.id, sql.Int],
          ["vid", videoId, sql.Int],
          ["pos", i + 1, sql.Int],
        ]
      );
    }

    // ----------------------------------------
    // 5. Set playlist COVER IMAGE (full thumbnail parsing)
    // ----------------------------------------
    let playlistImage = null;

    try {
      const first = selected[0];

      const thumbs =
        typeof first.thumbnails === "string"
          ? JSON.parse(first.thumbnails || "{}")
          : first.thumbnails || {};

      playlistImage = thumbs.medium?.url || thumbs.default?.url || null;

      if (playlistImage) {
        await queryDB(`UPDATE Playlists SET image = @img WHERE id = @id`, [
          ["img", playlistImage, sql.NVarChar],
          ["id", playlist.id, sql.Int],
        ]);
      }
    } catch (e) {
      console.error("Failed to assign playlist image:", e);
    }

    // ----------------------------------------
    // 6. RESPONSE
    // ----------------------------------------
    res.json({
      message: "Playlist generated",
      playlistId: playlist.id,
      tagIds,
      image: playlistImage,
      owner_id: ownerId,
    });
  })
);

export default router;
