import fs from "fs";
import path from "path";
import { getPool } from "./db.js";
import { logger } from "./utils/logger.js";

const seedsDir = path.resolve("./seeds");

async function runSeedFiles(pool) {
  const files = fs
    .readdirSync(seedsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    logger.info(`🌱 Running seed: ${file}`);
    const sqlText = fs.readFileSync(path.join(seedsDir, file), "utf8");
    const statements = sqlText
      .split(/^\s*GO\s*$/gim)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await pool.request().batch(statement);
    }
  }

  logger.info("✅ Seeding complete.");
}

async function run() {
  try {
    const pool = await getPool();
    await runSeedFiles(pool);
    await pool.close();
  } catch (err) {
    logger.error("❌ Seeding error:", err);
    process.exit(1);
  }
}

run();
