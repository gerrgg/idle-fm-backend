ALTER TABLE Videos
ADD channel_title NVARCHAR(255) NULL;

ALTER TABLE Videos
ADD thumbnails NVARCHAR(MAX) NULL;

ALTER TABLE Videos
ADD duration NVARCHAR(50) NULL;

ALTER TABLE Videos
ADD raw_json NVARCHAR(MAX) NULL;

CREATE TABLE youtube_search_cache (
  id INT IDENTITY PRIMARY KEY,
  query NVARCHAR(500) NOT NULL,
  video_ids NVARCHAR(MAX) NOT NULL, -- JSON array ["abc123","xyz999"]
  created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
);

CREATE INDEX idx_youtube_search_query
ON youtube_search_cache (query);
