import express from "express";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";
import bcrypt from "bcrypt";
import sql from "mssql";
import crypto from "crypto";
import { sendActivationEmail } from "../utils/mailer.js";

const router = express.Router();

/*
 * GET /users
 * Fetch all users
 *
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const users = await queryDB("SELECT * FROM Users");
    res.json(users);
  })
);

/**
 * POST /users
 * Create a new user
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    // --- Basic validation ---
    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    // password should be atleast 8 characters long
    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters long" });
    }

    // --- Check for existing user ---
    const existing = await queryDB(
      "SELECT id FROM Users WHERE email = @email",
      [["email", email, sql.NVarChar]]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // --- Hash password + create activation token ---
    const passwordHash = await bcrypt.hash(password, 10);

    const activationToken = crypto.randomBytes(32).toString("hex");
    const activationHash = crypto
      .createHash("sha256")
      .update(activationToken)
      .digest("hex");

    // --- Insert user ---
    const result = await queryDB(
      `
      INSERT INTO Users (username, email, password_hash, activation_hash)
      OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, INSERTED.created_at, INSERTED.activation_expires
      VALUES (@username, @email, @password_hash, @activation_hash)
      `,
      [
        ["username", username, sql.NVarChar],
        ["email", email, sql.NVarChar],
        ["password_hash", passwordHash, sql.NVarChar],
        ["activation_hash", activationHash, sql.NVarChar],
      ]
    );

    const user = result[0];

    const baseUrl =
      process.env.NODE_ENV === "production"
        ? "https://idle.fm"
        : "http://localhost:5173";

    const activationUrl = `${baseUrl}/activate?token=${activationToken}&uid=${user.id}`;
    await sendActivationEmail(email, username, activationUrl);

    res.status(201).json({
      message:
        "User created. Please check your email to activate your account.",
      user,
    });
  })
);
router.get(
  "/activate",
  asyncHandler(async (req, res) => {
    const { token, uid } = req.query;

    console.log("Activation request:", req.query, { token, uid });
    if (!token || !uid)
      return res.status(400).json({ error: "Missing token or user ID" });

    // Hash the token for comparison
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Get the user by ID
    const rows = await queryDB(
      `
      SELECT id, username, email, activated_at, activation_hash, activation_expires
      FROM Users
      WHERE id = @uid
    `,
      [["uid", uid, sql.Int]]
    );

    if (!rows.length)
      return res.redirect(`${process.env.BASE_URL}/activate?status=invalid`);

    const user = rows[0];
    const now = new Date();
    const expiry = new Date(user.activation_expires);

    if (user.activated_at) {
      return res.json({
        status: "already",
        message: "Account already active",
        user,
      });
    }
    if (user.activation_hash === hashedToken && expiry > now) {
      await queryDB(
        `UPDATE Users
        SET activated_at = SYSDATETIMEOFFSET(), activation_hash = NULL
        WHERE id = @id`,
        [["id", user.id, sql.Int]]
      );
      return res.json({
        status: "success",
        message: "Account activated",
        user,
      });
    }
    return res.json({ status: "invalid", message: "Invalid or expired token" });
  })
);

export default router;
