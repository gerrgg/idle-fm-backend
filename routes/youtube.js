import express from "express";
import { searchYouTubeCached } from "../services/youtubeCache.js";
import { decodeHtml } from "../utils/decodeHtml.js";

const router = express.Router();

router.get("/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Missing query parameter" });

  try {
    const rows = await searchYouTubeCached(q);

    const mapped = rows.map((row) => {
      let thumbs = {};

      try {
        if (row.thumbnails) {
          thumbs =
            typeof row.thumbnails === "string"
              ? JSON.parse(row.thumbnails)
              : row.thumbnails;
        }
      } catch (e) {
        console.warn("Invalid thumbnail JSON for:", row.youtube_key);
        thumbs = {};
      }

      const primaryThumb = thumbs?.medium?.url || thumbs?.default?.url || null;

      return {
        id: row.youtube_key,
        title: decodeHtml(row.title ?? ""),
        channel: decodeHtml(row.channel_title ?? ""),
        duration: row.duration ?? null,
        thumbnails: thumbs,
        thumbnail: primaryThumb,
      };
    });

    res.json(mapped);
  } catch (err) {
    console.error("YouTube search route error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
