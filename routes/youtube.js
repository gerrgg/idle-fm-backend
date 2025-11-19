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
      const thumbs = row.thumbnails ? JSON.parse(row.thumbnails) : {};

      return {
        id: row.youtube_key,
        title: decodeHtml(row.title),
        channel: decodeHtml(row.channel_title),
        duration: row.duration, // raw ISO ("PT3M46S")
        thumbnails: thumbs, // send entire thumb set
        thumbnail: thumbs.medium?.url, // primary
      };
    });

    res.json(mapped);
  } catch (err) {
    console.error("YouTube search route error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
