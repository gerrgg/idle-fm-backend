import crypto from "crypto";
import sql from "mssql";
import { queryDB } from "../utils/dbHelpers.js";
import { sendActivationEmail } from "../utils/mailer.js";

export async function createActivation(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  // delete any old activation rows for this user
  await queryDB("DELETE FROM Activations WHERE user_id = @uid", [
    ["uid", user.id, sql.Int],
  ]);

  // insert new activation row
  await queryDB(
    `INSERT INTO Activations (user_id, token)
     VALUES (@uid, @token)`,
    [
      ["uid", user.id, sql.Int],
      ["token", hash, sql.NVarChar],
    ]
  );

  const activationUrl = `${process.env.FRONTEND_URL}/activate?token=${token}`;
  await sendActivationEmail(user.email, user.username, activationUrl);

  return activationUrl;
}
