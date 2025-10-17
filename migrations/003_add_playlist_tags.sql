-- 1. Update existing playlists table
ALTER TABLE Playlists
ADD description NVARCHAR(1000) NULL;

-- 2. Master list of tags
CREATE TABLE Tags (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(100) NOT NULL UNIQUE
);

-- 3. Many-to-many link between playlists and tags
CREATE TABLE PlaylistTags (
  playlist_id INT NOT NULL,
  tag_id INT NOT NULL,
  CONSTRAINT PK_PlaylistTags PRIMARY KEY (playlist_id, tag_id),
  CONSTRAINT FK_PlaylistTags_Playlists FOREIGN KEY (playlist_id)
    REFERENCES Playlists(id)
    ON DELETE CASCADE,
  CONSTRAINT FK_PlaylistTags_Tags FOREIGN KEY (tag_id)
    REFERENCES Tags(id)
    ON DELETE CASCADE
);
