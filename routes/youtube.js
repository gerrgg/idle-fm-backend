// routes/youtube.routes.js
import express from "express";
import fetch from "node-fetch";

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
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Missing query parameter" });

  const key = process.env.YOUTUBE_API_KEY;
  const endpoint = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q=${encodeURIComponent(
    query
  )}&key=${key}`;

  try {
    const r = await fetch(endpoint);
    const data = await r.json();

    if (data.error) {
      console.error("YouTube API error:", data.error);
      return res.status(500).json({ error: "YouTube API error" });
    }

    const videos = data.items.map((item) => ({
      id: item.id.videoId,
      title: decodeHtml(item.snippet.title),
      thumbnail: item.snippet.thumbnails.medium.url,
    }));

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json(videos);
  } catch (err) {
    console.error("YouTube fetch failed:", err);
    res.status(500).json({ error: "Failed to fetch from YouTube" });
  }
});

export default router;
