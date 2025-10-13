import express from "express";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";
import bcrypt from "bcrypt";
import sql from "mssql";
import crypto from "crypto";
import { sendActivationEmail } from "../utils/mailer.js";
import { auth } from "../middleware/auth.js";

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

    // --- Insert user ---
    const result = await queryDB(
      `
      INSERT INTO Users (username, email, password_hash)
      OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, INSERTED.created_at
      VALUES (@username, @email, @password_hash)
      `,
      [
        ["username", username, sql.NVarChar],
        ["email", email, sql.NVarChar],
        ["password_hash", passwordHash, sql.NVarChar],
      ]
    );

    const user = result[0];

    // --- Insert activation token ---
    const activationToken = crypto.randomBytes(32).toString("hex");
    const activationHash = crypto
      .createHash("sha256")
      .update(activationToken)
      .digest("hex");

    await queryDB(
      `INSERT INTO Activations (user_id, token) VALUES (@userId, @token)`,
      [
        ["userId", user.id, sql.Int],
        ["token", activationHash, sql.NVarChar],
      ]
    );

    const activationUrl = `${process.env.FRONTEND_URL}/activate?token=${activationToken}`;
    await sendActivationEmail(email, username, activationUrl);

    res.status(201).json({
      message:
        "Account created. Please check your email to activate your account.",
    });
  })
);

/**
 * Test cookie based authentication
 * This is just for testing purposes and should not be used in production.
 */
router.get(
  "/test-auth",
  auth,
  asyncHandler(async (req, res) => {
    res.json({ message: "Authenticated", user: req.user });
  })
);

/**
 * GET /users/profile
 * Get the authenticated user's profile
 * Requires authentication via the auth middleware
 */
router.get(
  "/profile",
  auth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const rows = await queryDB(
      `
      SELECT id, username, email
      FROM Users
      WHERE id = @id
    `,
      [["id", userId, sql.Int]]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(rows[0]);
  })
);

export default router;
