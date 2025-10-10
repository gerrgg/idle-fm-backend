import express from "express";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const videos = await queryDB("SELECT * FROM Videos");
    res.json(videos);
  })
);

export default router;
