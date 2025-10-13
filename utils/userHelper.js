import { queryDB, asyncHandler } from "../utils/dbHelpers.js";
import sql from "mssql";
import crypto from "crypto";

/**
 * Generate a random activation hash.
 */
export const generateActivationToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Update the user's activation hash and set the expiration time.
 */
export const updateUserActivationHash = async (userId, token) => {
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  const query = `
    UPDATE Users
    SET activation_hash = @hash, activation_expires = DATEADD(HOUR, 24, SYSDATETIMEOFFSET())
    WHERE id = @userId
  `;
  await queryDB(query, [
    ["hash", hash, sql.VarChar],
    ["userId", userId, sql.Int],
  ]);
};
