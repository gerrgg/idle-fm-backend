import { queryDB } from "./dbHelpers.js";
import sql from "mssql";

export async function generateUniqueTitle(userId, title) {
  let base = title.trim();
  let suffix = 0;
  let newTitle = base;
  let exists = true;

  while (exists) {
    const result = await queryDB(
      `SELECT COUNT(*) AS count FROM Playlists WHERE user_id = @userId AND title = @title`,
      [
        ["userId", userId, sql.Int],
        ["title", newTitle, sql.NVarChar],
      ]
    );

    if (result[0].count === 0) {
      exists = false;
    } else {
      suffix++;
      newTitle = `${base} (${suffix})`;
    }
  }

  return newTitle;
}
