USE idle_fm_dev;
SELECT
  r.name AS role_name,
  m.name AS member_name
FROM sys.database_role_members drm
JOIN sys.database_principals r ON drm.role_principal_id = r.principal_id
JOIN sys.database_principals m ON drm.member_principal_id = m.principal_id
WHERE r.name IN ('app_role','migration_role','readonly_role','admin_role');
GO
