import fetch from "node-fetch";

export async function fetchVideoDetails(videoIds) {
  if (!videoIds.length) return [];

  const key = process.env.YOUTUBE_API_KEY;

  const endpoint =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=contentDetails` +
    `&id=${videoIds.join(",")}` +
    `&key=${key}`;

  const r = await fetch(endpoint);
  const data = await r.json();

  if (data.error) {
    console.error("YouTube video details error:", data.error);
    return [];
  }

  return data.items; // array of full video objects
}
