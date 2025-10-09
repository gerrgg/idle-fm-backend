import dotenv from "dotenv";

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";

dotenv.config({ path: envFile });

console.log(`🌎 Loaded environment from ${envFile}`);

export const dbConfig = {
  server: process.env.MSSQL_SERVER,
  port: parseInt(process.env.MSSQL_PORT || "1433", 10),
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: process.env.NODE_ENV === "production",
    trustServerCertificate: process.env.NODE_ENV !== "production",
  },
};

export const isProduction = process.env.NODE_ENV === "production";
