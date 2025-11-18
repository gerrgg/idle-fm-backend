// routes/youtube.js

import express from "express";
import { searchYouTubeCached } from "../services/youtubeCache.js";

const router = express.Router();

function decodeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

router.get("/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Missing query parameter" });

  try {
    // Use cached search + hydration pipeline
    const rows = await searchYouTubeCached(q);

    console.log(rows);

    return;

    // Convert DB rows to your frontend format
    const mapped = rows.map((row) => ({
      id: row.youtube_key,
      title: decodeHtml(row.title),
      thumbnail: JSON.parse(row.thumbnails)?.medium?.url,
    }));

    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
