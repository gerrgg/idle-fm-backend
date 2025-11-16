USE idle_fm_dev;
GO

-- Drop users if they exist
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'idle_app_user')
  DROP USER idle_app_user;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'idle_migration_user')
  DROP USER idle_migration_user;
  IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'idle_migrate_user')
  DROP USER idle_migrate_user;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'idle_readonly_user')
  DROP USER idle_readonly_user;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'idle_admin_user')
  DROP USER idle_admin_user;
GO

-- Drop roles if they exist
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'app_role')
  DROP ROLE app_role;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'migration_role')
  DROP ROLE migration_role;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'readonly_role')
  DROP ROLE readonly_role;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'admin_role')
  DROP ROLE admin_role;
GO

USE master;
GO

-- Drop logins if they exist
IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'idle_app')
  DROP LOGIN idle_app;
IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'idle_migrate')
  DROP LOGIN idle_migrate;
IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'idle_migration')
  DROP LOGIN idle_migration;
IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'idle_readonly')
  DROP LOGIN idle_readonly;
IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'idle_admin')
  DROP LOGIN idle_admin;
GO
