USE idle_fm_dev;
GO
SELECT name, type_desc, create_date
FROM sys.database_principals
WHERE name LIKE 'idle_%';
