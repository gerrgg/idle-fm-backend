// services/youtubeCache.js
import { queryDB } from "../utils/dbHelpers.js";
import { runYouTubeSearch } from "../utils/youtubeApi.js";
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
export async function storeVideoMetadata(video) {
  const id = extractVideoId(video);

  if (!id) {
    console.warn("❌ storeVideoMetadata skipped: invalid ID:", video);
    return;
  }

  console.log(`Storing metadata for ID: ${id}`);

  try {
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
        ["title", video.snippet.title],
        ["channel_title", video.snippet.channelTitle],
        ["thumbnails", JSON.stringify(video.snippet.thumbnails)],
        ["duration", video.contentDetails?.duration || null],
        ["raw_json", JSON.stringify(video)],
      ]
    );

    console.log(`✔ Stored video in DB: ${id}`);
  } catch (err) {
    console.error(`❌ FAILED storing video ${id}:`, err);
  }
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

  console.log(`\n--- YOUTUBE SEARCH PIPELINE START ---`);
  console.log(`Query: "${query}"`);

  /* 1. Try cache */
  const cachedIds = await getCachedSearch(query);

  if (cachedIds) {
    console.log(`CACHE HIT: Found ${cachedIds.length} IDs =>`, cachedIds);

    const hydrated = await hydrateVideos(cachedIds);

    console.log(
      `HYDRATED FROM DB: ${hydrated.length} videos (order preserved)`
    );

    console.log(`--- PIPELINE END (CACHE HIT) ---\n`);
    return hydrated;
  }

  console.log(`CACHE MISS: No valid cache for "${query}"`);

  /* 2. Fetch from YouTube API */
  const fresh = await runYouTubeSearch(query);

  if (!fresh.items) {
    console.error("❌ ERROR: YouTube returned no items:", fresh);
    throw new Error("Invalid YouTube API response");
  }

  console.log(`YouTube returned ${fresh.items.length} items.`);

  /* ID Extraction Debug */
  const videoIds = [];
  const skippedItems = [];

  for (const item of fresh.items) {
    const id = extractVideoId(item);
    if (id) {
      videoIds.push(id);
    } else {
      skippedItems.push(item);
    }
  }

  console.log(`Extracted video IDs:`, videoIds);
  if (skippedItems.length) {
    console.warn(
      `⚠️ WARNING: Skipped ${skippedItems.length} invalid/unsupported YouTube items`
    );
    skippedItems.forEach((it, idx) =>
      console.warn(`  Skipped[${idx}]:`, JSON.stringify(it, null, 2))
    );
  }

  /* 3. Cache the ID array */
  console.log(`Caching ${videoIds.length} IDs for "${query}"`);
  await storeSearchCache(query, videoIds);

  /* 4. Store individual metadata */
  console.log(`Storing metadata for ${videoIds.length} videos...`);

  for (const item of fresh.items) {
    const id = extractVideoId(item);
    if (!id) continue;

    try {
      await storeVideoMetadata(item);
      console.log(`  ✔ Stored video: ${id}`);
    } catch (err) {
      console.error(`  ❌ FAILED to store video ${id}:`, err.message);
    }
  }

  /* 5. Hydrate from DB + return final objects */
  console.log(`Hydrating ${videoIds.length} videos from DB...`);
  const hydrated = await hydrateVideos(videoIds);

  console.log(
    `Hydration complete. Returned ${hydrated.length} videos to client.`
  );
  console.log(`--- YOUTUBE SEARCH PIPELINE END (FRESH FETCH) ---\n`);

  return hydrated;
}
