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
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
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

    const activationUrl = `${process.env.BACKEND_URL}/activate?token=${activationToken}&redirect=true`;
    await sendActivationEmail(email, username, activationUrl);

    res.status(201).json({
      message:
        "Account created. Please check your email to activate your account.",
    });
  })
);

/**
 * GET /users/:id/playlists
 */
router.get(
  "/:id/playlists",
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id, 10);

    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const rows = await queryDB(
      `
      SELECT 
        p.id,
        p.title,
        p.description,
        p.created_at,
        p.is_public,
        p.image,
        p.user_id AS owner_id,
        u.username AS owner_username,
        p.likes,
        p.shares,
        p.views,
        (
          SELECT 
            v.id,
            v.youtube_key,
            v.title,
            v.duration,
            pv.added_at,
            v.channel_title,
            JSON_QUERY(v.thumbnails) AS thumbnails,
            pv.position
          FROM PlaylistVideos pv
          INNER JOIN Videos v ON pv.video_id = v.id
          WHERE pv.playlist_id = p.id
          ORDER BY pv.position
          FOR JSON PATH
        ) AS videos,

        (
          SELECT 
            t.id,
            t.name
          FROM PlaylistTags pt
          INNER JOIN Tags t ON pt.tag_id = t.id
          WHERE pt.playlist_id = p.id
          ORDER BY t.name ASC
          FOR JSON PATH
        ) AS tags

      FROM Playlists p
      JOIN Users u ON p.user_id = u.id
      WHERE p.user_id = @userId 
      ORDER BY p.created_at DESC
      `,
      [["userId", userId, sql.Int]]
    );

    const normalized = rows.map((r) => {
      const videos = r.videos ? JSON.parse(r.videos) : [];
      const tags = r.tags ? JSON.parse(r.tags) : [];

      return {
        playlist: {
          id: r.id,
          title: r.title,
          description: r.description,
          created_at: r.created_at,
          is_public: r.is_public,
          image: r.image,
          owner_id: r.owner_id,
          owner_username: r.owner_username,
          videoIds: videos.map((v) => v.id),
          tagIds: tags.map((t) => t.id),
          views: r.views ?? 0,
          likes: r.likes ?? 0,
          shares: r.shares ?? 0,
        },

        videos: videos,
        tags: tags,

        playlistVideos: videos.map((v) => ({
          playlistId: r.id,
          videoId: v.id,
          added_at: v.added_at,
          position: v.position,
        })),
      };
    });

    res.json(normalized);
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

export default router;
