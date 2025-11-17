USE idle_fm_dev;
GO
EXEC sp_addrolemember 'app_role', 'idle_app_user';
EXEC sp_addrolemember 'migration_role', 'idle_migration_user';
EXEC sp_addrolemember 'readonly_role', 'idle_readonly_user';
EXEC sp_addrolemember 'admin_role', 'idle_admin_user';
GO
