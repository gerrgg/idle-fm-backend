ALTER TABLE PasswordResets
ADD CONSTRAINT FK_PasswordResets_Users
    FOREIGN KEY (user_id)
    REFERENCES Users(id)
    ON DELETE CASCADE