USE master;
GO
SELECT name, type_desc, create_date
FROM sys.server_principals
WHERE name LIKE 'idle_%';
