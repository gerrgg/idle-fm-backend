import fs from "fs";
import path from "path";
import { getPool } from "./db.js";
import sql from "mssql";

const migrationsDir = path.resolve("./migrations");
const dbName = process.env.MSSQL_DATABASE;

// Ensures migrations tracking table exists
async function ensureMigrationsTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='__migrations' AND xtype='U')
      CREATE TABLE __migrations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255),
        run_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
      );
  `);
}

async function listApplied(pool) {
  const { recordset } = await pool
    .request()
    .query("SELECT name FROM __migrations ORDER BY id DESC");
  return recordset.map((r) => r.name);
}

// --- FIX: Split SQL statements on "GO" ---
async function runSqlFile(pool, filePath) {
  const sqlText = fs.readFileSync(filePath, "utf8");

  // Split on GO (case-insensitive, surrounded by newlines)
  const statements = sqlText
    .split(/^\s*GO\s*$/gim)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    try {
      await pool.request().batch(statement);
    } catch (err) {
      console.error(`❌ Error running statement in ${filePath}:`, err.message);
      throw err;
    }
  }
}

// --- Apply all new migrations ---
async function applyMigrations(pool) {
  const applied = new Set(await listApplied(pool));
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    console.log(`🟢 Running migration: ${file}`);
    await runSqlFile(pool, path.join(migrationsDir, file));
    await pool
      .request()
      .input("name", file)
      .query("INSERT INTO __migrations (name) VALUES (@name)");
  }
  console.log("✅ All migrations applied.");
}

async function rollbackLast(pool) {
  const applied = await listApplied(pool);
  if (applied.length === 0) {
    console.log("⚠️ No migrations to rollback.");
    return;
  }

  const last = applied[0];
  const rollbackFile = path.join(
    migrationsDir,
    last.replace(".sql", "_rollback.sql")
  );

  if (!fs.existsSync(rollbackFile)) {
    console.log(`⚠️ No rollback file found for ${last} (${rollbackFile})`);
    return;
  }

  console.log(`⏪ Rolling back migration: ${last}`);
  await runSqlFile(pool, rollbackFile);
  await pool
    .request()
    .input("name", last)
    .query("DELETE FROM __migrations WHERE name=@name");
  console.log("✅ Rollback complete.");
}

async function resetDatabase() {
  console.log(`⚠️ Resetting database: ${dbName}`);

  const adminPool = await sql.connect({
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    server: process.env.MSSQL_SERVER,
    database: "master", // critical: connect to master, not target DB
    options: { encrypt: true, trustServerCertificate: true },
  });

  await adminPool.request().query(`
    IF EXISTS (SELECT * FROM sys.databases WHERE name = '${dbName}')
    BEGIN
      ALTER DATABASE [${dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
      DROP DATABASE [${dbName}];
    END;
  `);

  await adminPool.request().query(`CREATE DATABASE [${dbName}];`);
  console.log(`✅ Database ${dbName} recreated.`);
  await adminPool.close();
}

// --- Entrypoint ---
async function run() {
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const rollback = args.includes("--rollback");

  if (reset && process.env.NODE_ENV !== "development") {
    console.error("❌ --reset is only allowed in development.");
    process.exit(1);
  }

  if (reset) await resetDatabase();

  const pool = await getPool();
  await ensureMigrationsTable(pool);

  if (rollback) await rollbackLast(pool);
  else await applyMigrations(pool);

  await pool.close();
}

run().catch((err) => {
  console.error("❌ Migration error:", err);
  process.exit(1);
});
