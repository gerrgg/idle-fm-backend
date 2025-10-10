import express from "express";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const result = await pool.request().query("SELECT * FROM Users");
    res.json(result.recordset);
  })
);

export default router;
