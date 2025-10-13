import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { isProduction } from "./config/dbConfig.js";

import usersRouter from "./routes/users.js";
import videosRouter from "./routes/videos.js";
import playlistsRouter from "./routes/playlists.js";
import gifsRouter from "./routes/gifs.js";
import authRouter from "./routes/auth.js";
import activationsRouter from "./routes/activations.js";

const app = express();

// --- CORS ---
const allowedOrigins = isProduction
  ? ["https://idle.fm", "https://www.idle.fm"]
  : ["http://localhost:5173", "http://localhost:8080"];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

app.use("/users", usersRouter);
app.use("/videos", videosRouter);
app.use("/playlists", playlistsRouter);
app.use("/gifs", gifsRouter);
app.use("/auth", authRouter);
app.use("/activate", activationsRouter);

// --- Health Check ---
app.get("/", (req, res) => {
  res.json({ message: "Idle.fm API is running" });
});

// --- START SERVER ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ API running on ${process.env.BACKEND_URL}`);
});
