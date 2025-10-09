import sql from "mssql";
import { dbConfig } from "./config/dbConfig.js";

let pool;

export const getPool = async () => {
  if (pool) return pool;
  try {
    pool = await sql.connect(dbConfig);
    console.log(`✅ Connected to MSSQL: ${dbConfig.database}`);
    return pool;
  } catch (err) {
    console.error("❌ MSSQL Connection Error:", err);
    throw err;
  }
};
