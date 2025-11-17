USE idle_fm_dev;
GO

SELECT name, type_desc
FROM sys.database_principals
WHERE name LIKE 'idle_%' OR name LIKE '%role%';

USE master;
GO

SELECT name, type_desc
FROM sys.server_principals
WHERE name LIKE 'idle_%';
