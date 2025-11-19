import fetch from "node-fetch";

export async function runYouTubeSearch(query) {
  const key = process.env.YOUTUBE_API_KEY;

  const endpoint = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&q=${encodeURIComponent(
    query
  )}&key=${key}`;

  const r = await fetch(endpoint);
  const data = await r.json();

  if (data.error) throw new Error(JSON.stringify(data.error));
  return data; // raw response for the caching layer
}
