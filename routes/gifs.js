import express from "express";
import { queryDB, asyncHandler } from "../utils/dbHelpers.js";
import sql from "mssql";

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const gifs = await queryDB("SELECT * FROM Gifs");
    res.json(gifs);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const gifId = parseInt(req.params.id, 10);
    if (isNaN(gifId)) return res.status(400).json({ error: "Invalid GIF ID" });

    const result = await queryDB(
      "DELETE FROM Gifs WHERE id = @id",
      [["id", gifId, sql.Int]]
    );

    if (! result) {
      return res.status(404).json({ error: "GIF not found" });
    }

    res.json({ message: "GIF deleted successfully" });
  })
);

export default router;
