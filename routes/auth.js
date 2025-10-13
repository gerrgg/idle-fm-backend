import express from "express";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";
import sql from "mssql";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { createActivation } from "../utils/createActivation.js";

import { sendPasswordResetEmail } from "../utils/mailer.js";

const router = express.Router();

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const rows = await queryDB("SELECT * FROM Users WHERE email = @Email", [
      ["Email", email, sql.VarChar],
    ]);

    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if the password matches
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.is_active) {
      await createActivation(user); // reuse same logic
      return res.status(403).json({
        status: "inactive",
        message:
          "Your account is not yet activated. A new activation link has been sent to your email.",
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ message: "Login successful" });
  })
);

router.post(
  "/request-password-reset",
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    const rows = await queryDB("SELECT * FROM Users WHERE email = @Email", [
      ["Email", email, sql.VarChar],
    ]);

    const user = rows[0];

    if (!user) {
      if (process.env.NODE_ENV === "production") {
        res.json({ message: "Password reset link sent if email exists." });
      } else {
        return res.status(404).json({ message: "User not found" });
      }
    }

    // Generate a password reset token
    const resetToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Store the hashed token in the database
    await queryDB(
      "INSERT INTO PasswordResets (user_id, token, expires_at) VALUES (@user_id, @token, @expires_at)",
      [
        ["user_id", user.id, sql.Int],
        ["token", hashedToken, sql.NVarChar],
        ["expires_at", new Date(Date.now() + 3600000), sql.DateTime], // 1 hour expiry
      ]
    );

    const resetUrl = `${process.env.BACKEND_URL}/auth/reset-password?token=${resetToken}`;

    await sendPasswordResetEmail(email, user.username, resetUrl);

    res.json({ message: "Password reset link sent if email exists." });
  })
);

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Hash the token for comparison
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Check if the reset token is valid
    const rows = await queryDB(
      "SELECT * FROM PasswordResets WHERE token = @token",
      [["token", hashedToken, sql.NVarChar]]
    );

    const resetEntry = rows[0];

    if (!resetEntry || resetEntry.expires_at < new Date()) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update the user's password
    await queryDB(
      "UPDATE Users SET password_hash = @password_hash WHERE id = @user_id",
      [
        ["password_hash", passwordHash, sql.NVarChar],
        ["user_id", resetEntry.user_id, sql.Int],
      ]
    );

    // Delete the reset entry
    await queryDB("DELETE FROM PasswordResets WHERE id = @id", [
      ["id", resetEntry.id, sql.Int],
    ]);

    res.json({ message: "Password reset successful" });
  })
);

export default router;
