import express from "express";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const gifs = await queryDB("SELECT * FROM Gifs");
    res.json(gifs);
  })
);

export default router;
