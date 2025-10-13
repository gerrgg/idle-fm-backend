import sql from "mssql";
import { dbConfig } from "./config/dbConfig.js";
import { logger } from "./utils/logger.js";

let pool;

export const getPool = async () => {
  if (pool) return pool;
  try {
    pool = await sql.connect(dbConfig);
    logger.info(`✅ Connected to MSSQL: ${dbConfig.database}`);
    return pool;
  } catch (err) {
    logger.error("❌ MSSQL Connection Error:", err);
    throw err;
  }
};
