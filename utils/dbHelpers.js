// utils/dbHelpers.js
import { getPool } from "../db.js";
import { logger } from "./logger.js";

/**
 * Execute a SQL query safely with automatic connection management + error handling.
 */
export async function queryDB(query, params = []) {
  const pool = await getPool();
  const request = pool.request();

  // Bind parameters (if any)
  for (const [name, value, type] of params) {
    if (type) request.input(name, type, value);
    else request.input(name, value);
  }

  try {
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    logger.error("❌ SQL Error:", err);
    throw new Error(err.message);
  }
}

/**
 * Universal handler wrapper for route functions.
 * Catches async errors so you don’t need try/catch in every route.
 */
export function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      logger.error("❌ Route Error:", err);
      res.status(500).json({ error: "Database error", details: err.message });
    });
  };
}
