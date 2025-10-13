import express from "express";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";
import sql from "mssql";
import bcrypt from "bcrypt";
import {
  generateActivationToken,
  updateUserActivationHash,
} from "../utils/userHelper.js";

import { sendActivationEmail } from "../utils/mailer.js";

const router = express.Router();

router.post(
  "/",
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
    bcrypt.compare(password, user.password_hash, (err, isMatch) => {
      if (err) {
        console.error("❌ Password comparison error:", err);
        return res.status(500).json({ error: "Internal server error" });
      }

      if (!isMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // check if the user is activated
      if (!user.activated_at) {
        const token = generateActivationToken();
        updateUserActivationHash(user.id, token);

        const activationUrl = `${process.env.BACKEND_URL}/users/activate?token=${token}&uid=${user.id}`;
        sendActivationEmail(user.email, user.username, activationUrl);

        return res
          .status(403)
          .json({ error: "Account not activated, please check email." });
      }

      const { password_hash, ...userData } = user;
      res.json(userData);
    });
  })
);

export default router;
