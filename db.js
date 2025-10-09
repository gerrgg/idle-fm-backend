// db.js
import sql from "mssql";
import dotenv from "dotenv";
dotenv.config();

const config = {
  server: process.env.MSSQL_SERVER,
  port: parseInt(process.env.MSSQL_PORT, 10) || 1433,
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: {
    encrypt: process.env.MSSQL_ENCRYPT === "true",
    trustServerCertificate: true,
  },
};

let pool;

export const getPool = async () => {
  if (pool) return pool;
  try {
    pool = await sql.connect(config);
    console.log(`✅ Connected to MSSQL: ${config.database}`);
    return pool;
  } catch (err) {
    console.error("❌ MSSQL Connection Error:", err);
    throw err;
  }
};
