// services/youtubeCache.js
import { queryDB } from "../utils/dbHelpers.js";
import { runYouTubeSearch } from "../utils/youtubeApi.js";
import { fetchVideoDetails } from "../utils/youtubeVideoDetails.js";
import { decodeHtml } from "../utils/decodeHtml.js";
import sql from "mssql"; // only used for type bindings when needed

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

function normalizeQuery(q) {
  return q.trim().toLowerCase();
}

/* -------------------------------------------------------
   1. GET CACHED SEARCH (returns array of videoIds or null)
------------------------------------------------------- */
export async function getCachedSearch(query) {
  const rows = await queryDB(
    `
    SELECT TOP 1 video_ids, created_at
    FROM youtube_search_cache
    WHERE query = @query
    ORDER BY created_at DESC
    `,
    [["query", query]]
  );

  if (!rows.length) return null;

  const row = rows[0];
  const age = Date.now() - new Date(row.created_at).getTime();

  // expire after 7 days
  if (age > 7 * 86400 * 1000) return null;

  return JSON.parse(row.video_ids);
}

/* -------------------------------------------------------
   2. STORE CACHED SEARCH
------------------------------------------------------- */
export async function storeSearchCache(query, videoIds) {
  await queryDB(
    `
    INSERT INTO youtube_search_cache (query, video_ids)
    VALUES (@query, @video_ids)
    `,
    [
      ["query", query],
      ["video_ids", JSON.stringify(videoIds)],
    ]
  );
}

/* -------------------------------------------------------
   3. UPSERT VIDEO METADATA INTO Videos TABLE
------------------------------------------------------- */
export async function storeVideoMetadata(video, details = {}) {
  const id = extractVideoId(video);
  if (!id) return;

  const duration = details.contentDetails?.duration || null;
  const cleanTitle = decodeHtml(video.snippet.title);

  await queryDB(
    `
    MERGE Videos AS target
    USING (SELECT @youtube_key AS youtube_key) AS src
      ON target.youtube_key = src.youtube_key
    WHEN MATCHED THEN UPDATE SET
      title = @title,
      channel_title = @channel_title,
      thumbnails = @thumbnails,
      duration = @duration,
      raw_json = @raw_json,
      updated_at = SYSDATETIMEOFFSET()
    WHEN NOT MATCHED THEN INSERT (
      youtube_key, title, channel_title, thumbnails, duration, raw_json
    ) VALUES (
      @youtube_key, @title, @channel_title, @thumbnails, @duration, @raw_json
    );
    `,
    [
      ["youtube_key", id],
      ["title", cleanTitle],
      ["channel_title", video.snippet.channelTitle],
      ["thumbnails", JSON.stringify(video.snippet.thumbnails)],
      ["duration", duration],
      ["raw_json", JSON.stringify({ ...video, ...details })],
    ]
  );
}

/* -------------------------------------------------------
   4. HYDRATE VIDEOS FROM YOUR Videos TABLE
------------------------------------------------------- */
export async function hydrateVideos(videoIds) {
  if (!videoIds.length) return [];

  // Build named params dynamically
  const params = videoIds.map((id, i) => [`id${i}`, id]);

  const where = videoIds.map((_, i) => `@id${i}`).join(",");

  const rows = await queryDB(
    `
    SELECT youtube_key, title, thumbnails, channel_title, duration
    FROM Videos
    WHERE youtube_key IN (${where})
    `,
    params
  );

  // map results to maintain order
  const map = new Map(rows.map((v) => [v.youtube_key, v]));
  return videoIds.map((id) => map.get(id));
}

function extractVideoId(item) {
  if (!item) return null;

  // Normal search result shape
  if (item.id?.videoId) return String(item.id.videoId);

  // Sometimes YouTube returns { id: "abc123" }
  if (typeof item.id === "string") return item.id;

  // Rare edge-case: id object w/ string
  if (item.id?.kind === "youtube#video" && item.id.videoId)
    return String(item.id.videoId);

  return null;
}

/* -------------------------------------------------------
   5. MAIN CACHED SEARCH PIPELINE
------------------------------------------------------- */
export async function searchYouTubeCached(userQuery) {
  const query = normalizeQuery(userQuery);

  /* 1. Try cache first */
  const cachedIds = await getCachedSearch(query);
  if (cachedIds) {
    return hydrateVideos(cachedIds);
  }

  /* 2. Fetch from YouTube search API */
  const fresh = await runYouTubeSearch(query);
  if (!fresh.items) {
    throw new Error("Invalid YouTube API response: missing items");
  }

  /* 3. Extract IDs safely */
  const videoIds = fresh.items.map(extractVideoId).filter(Boolean); // remove null/invalid

  /* 4. Fetch contentDetails only once */
  const detailItems = await fetchVideoDetails(videoIds);

  const detailMap = new Map();
  for (const detail of detailItems) {
    detailMap.set(detail.id, detail);
  }

  /* 5. Save cache of ID list */
  await storeSearchCache(query, videoIds);

  /* 6. Store each video's metadata */
  for (const item of fresh.items) {
    const id = extractVideoId(item);
    if (!id) continue;

    const details = detailMap.get(id) || {};
    try {
      await storeVideoMetadata(item, details);
    } catch (err) {
      console.error(`Failed to store metadata for ${id}:`, err.message);
    }
  }

  /* 7. Hydrate fresh video metadata from DB */
  return hydrateVideos(videoIds);
}
