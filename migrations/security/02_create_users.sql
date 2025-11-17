USE idle_fm_dev;
GO

CREATE USER idle_app_user       FOR LOGIN idle_app;
CREATE USER idle_migration_user FOR LOGIN idle_migration;
CREATE USER idle_readonly_user  FOR LOGIN idle_readonly;
CREATE USER idle_admin_user     FOR LOGIN idle_admin;
GO
