import sql from "mssql";
import dotenv from "dotenv";

dotenv.config({ path: ".env.development" }); // load your dev env file

const config = {
  server: process.env.MSSQL_SERVER,
  port: parseInt(process.env.MSSQL_PORT, 10) || 1433,
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
};

async function testConnection() {
  try {
    console.log("🔌 Connecting to MSSQL...");
    const pool = await sql.connect(config);

    const result = await pool
      .request()
      .query(
        "SELECT DB_NAME() AS database_name, SYSDATETIMEOFFSET() AS utc_time;"
      );

    console.log("✅ Connected successfully!");
    console.table(result.recordset);

    await pool.close();
  } catch (err) {
    console.error("❌ Connection failed:");
    console.error(err.message);
  }
}

testConnection();
