import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import winston from "winston";
import { logger } from "./utils/logger.js";

import { isProduction } from "./config/dbConfig.js";

import usersRouter from "./routes/users.js";
import videosRouter from "./routes/videos.js";
import playlistsRouter from "./routes/playlists.js";
import gifsRouter from "./routes/gifs.js";
import authRouter from "./routes/auth.js";
import activationsRouter from "./routes/activations.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per window
  message: { error: "Too many authentication attempts. Try again later." },
  standardHeaders: true, // adds RateLimit-* headers
  legacyHeaders: false, // disables deprecated X-RateLimit-* headers
});

// --- CORS ---
const allowedOrigins = isProduction
  ? ["https://idle.fm", "https://www.idle.fm"]
  : ["http://localhost:5173"];

app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // disable for dev with Vite
    contentSecurityPolicy: isProduction ? undefined : false,
  })
);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(
  morgan("combined", {
    stream: {
      write: (msg) => logger.http(msg.trim()), // 'http' is a valid Winston level
    },
  })
);

logger.add(
  new winston.transports.File({ filename: "logs/debug.log", level: "debug" })
);

// prevents large payloads from crashing the server
app.use(express.json({ limit: "1mb" }));

app.use(cookieParser());

app.use(
  "/auth",
  (req, res, next) => {
    if (req.path === "/me") return next();
    return authLimiter(req, res, next);
  },
  authRouter
);

app.use("/users", usersRouter);
app.use("/videos", videosRouter);
app.use("/playlists", playlistsRouter);
app.use("/gifs", gifsRouter);
app.use("/activate", activationsRouter);

// --- Health Check ---
app.get("/", (req, res) => {
  res.json({ message: "Idle.fm API is running" });
});

app.use((req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, req, res, next) => {
  logger.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// --- START SERVER ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  logger.info(`✅ API running on ${process.env.BACKEND_URL}`);
});
