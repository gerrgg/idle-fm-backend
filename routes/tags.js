import express from "express";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";

const router = express.Router();

// Get Tags
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const tags = await queryDB("SELECT * FROM Tags");
    res.json(tags);
  })
);

export default router;
