USE idle_fm_dev;
GO

-- App role: CRUD on dbo schema
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO app_role;

-- Migration role: can alter schema
GRANT ALTER, CREATE TABLE, CREATE VIEW, CREATE PROCEDURE, DROP TABLE, DROP VIEW TO migration_role;

-- Read-only role: view data only
GRANT SELECT ON SCHEMA::dbo TO readonly_role;

-- Admin role: equivalent to db_owner
ALTER ROLE db_owner ADD MEMBER admin_role;
GO
