USE idle_fm_dev;
GO
-- Roles
SELECT name, type_desc FROM sys.database_principals WHERE type = 'R' AND name LIKE '%role%';

-- Role memberships
SELECT
  r.name AS role_name,
  m.name AS member_name
FROM sys.database_role_members drm
JOIN sys.database_principals r ON drm.role_principal_id = r.principal_id
JOIN sys.database_principals m ON drm.member_principal_id = m.principal_id
WHERE r.name LIKE '%role%' OR m.name LIKE 'idle_%';
