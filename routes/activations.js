import express from "express";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";
import sql from "mssql";
import crypto from "crypto";
import { createActivation } from "../utils/createActivation.js";

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: "Missing token" });

    const hashed = crypto.createHash("sha256").update(token).digest("hex");

    const rows = await queryDB(
      `
      SELECT A.id, A.user_id, A.expires_at, A.activated_at,
             U.is_active
      FROM Activations A
      JOIN Users U ON U.id = A.user_id
      WHERE A.token = @token
    `,
      [["token", hashed, sql.VarChar]]
    );

    const record = rows[0];
    if (!record)
      return res.json({
        status: "invalid",
        message: "Invalid activation link",
      });

    if (record.is_active || record.activated_at)
      return res.json({ status: "already", message: "Account already active" });

    const now = new Date(record.expires_at);
    if (now < new Date())
      return res.json({
        status: "invalid",
        message: "Activation link expired",
      });

    await queryDB(
      `
      UPDATE Users SET is_active = 1 WHERE id = @uid;
      UPDATE Activations SET activated_at = SYSDATETIMEOFFSET() WHERE id = @aid;
      `,
      [
        ["uid", record.user_id, sql.Int],
        ["aid", record.id, sql.Int],
      ]
    );

    res.json({ status: "success", message: "Account activated" });
  })
);

/**
 * Admin route to resend activation link
 * This is useful for users who may have lost the original activation email.
 */
router.post(
  "/resend-activation",
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const rows = await queryDB(
      "SELECT id, username, email, is_active FROM Users WHERE email = @e",
      [["e", email, sql.NVarChar]]
    );

    const user = rows[0];
    if (!user)
      return res.json({ message: "If the email exists, a new link was sent." });

    if (user.is_active) return res.json({ message: "Account already active." });

    const existing = await queryDB(
      "SELECT id, expires_at FROM Activations WHERE user_id = @uid",
      [["uid", user.id, sql.Int]]
    );

    const now = new Date();
    const record = existing[0];
    if (record && new Date(record.expires_at) > now) {
      return res.json({ message: "Current activation link still valid." });
    }

    await createActivation(user);

    res.json({
      message: "A new activation link has been sent to your email address.",
    });
  })
);

export default router;
