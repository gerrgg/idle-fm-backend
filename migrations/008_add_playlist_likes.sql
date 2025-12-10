CREATE TABLE PlaylistLikes (
  id INT IDENTITY PRIMARY KEY,
  user_id INT NOT NULL,
  playlist_id INT NOT NULL,
  created_at DATETIME DEFAULT GETDATE(),
  UNIQUE(user_id, playlist_id)
);
