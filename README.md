# 🎧 Idle FM Backend

The backend API for **Idle FM**, a lo-fi music streaming app that connects playlists, YouTube videos, and GIF loops into a relaxing visual/audio experience.

Built with:

- **Node.js + Express**
- **Microsoft SQL Server (MSSQL)**
- **Azure SQL Database** (production)
- **Cloudflare Pages** (frontend hosting)
- **Modular REST routing**

---

## 🧩 Project Overview

This backend provides a REST API to manage:

- **Users**
- **Playlists**
- **Videos**
- **GIFs**
- **Playlist–Video relationships**

The API supports both **local development** and **cloud deployment** on **Azure App Service**.

---

## ⚙️ Folder Structure

```
idle-fm-backend/
│
├── config/
│   └── dbConfig.js        # Loads environment config dynamically (dev/prod)
│
├── routes/
│   ├── users.js           # /users
│   ├── videos.js          # /videos
│   ├── gifs.js            # /gifs
│   └── playlists.js       # /playlists + /playlists/:id/videos
│
├── utils/
│   └── dbHelpers.js       # Reusable query and error handling helpers
│
├── migrations/            # SQL migration scripts
├── seeds/                 # Database seed data
│
├── db.js                  # MSSQL connection pool
├── migrate.js             # Migration runner script
├── server.js              # Main Express app
│
├── .env.development
├── .env.production
└── package.json
```

---

## 🏗️ Setup Instructions

### 1️⃣ Clone the repo

```bash
git clone https://github.com/gerrgg/idle-fm-backend.git
cd idle-fm-backend
```

### 2️⃣ Install dependencies

```bash
npm install
```

### 3️⃣ Run migrations

Creates all tables defined in `/migrations`:

```bash
NODE_ENV=development node migrate.js
```

### 4️⃣ Seed the database

Populates initial sample data from `/seeds`:

```bash
NODE_ENV=development node seeds/seed.js
```

### 5️⃣ Start the server

```bash
npm run dev
```

or

```bash
node server.js
```

---

## 🌍 API Routes

All routes return JSON.

### **Users**

| Method | Endpoint | Description   |
| ------ | -------- | ------------- |
| GET    | `/users` | Get all users |

---

### **Videos**

| Method | Endpoint  | Description    |
| ------ | --------- | -------------- |
| GET    | `/videos` | Get all videos |

---

### **GIFs**

| Method | Endpoint | Description  |
| ------ | -------- | ------------ |
| GET    | `/gifs`  | Get all GIFs |

---

### **Playlists**

| Method | Endpoint                | Description                               |
| ------ | ----------------------- | ----------------------------------------- |
| GET    | `/playlists`            | Get all playlists                         |
| GET    | `/playlists/videos`     | Get all playlist–video relationships      |
| GET    | `/playlists/:id/videos` | Get all videos within a specific playlist |

---

## 🚀 Deployment

Currently deployed to:

```
Production API: https://idle-fm-backend.azurewebsites.net
Frontend (Cloudflare): https://idle.fm
```

To redeploy:

```bash
az webapp up --name idle-fm-backend --resource-group idle-fm-rg --runtime "NODE:22-lts"
```

---

## 🔐 CORS Configuration

In `server.js`, CORS is automatically configured per environment:

```js
const allowedOrigins = isProduction
  ? ["https://idle.fm", "https://www.idle.fm"]
  : ["http://localhost:5173", "http://localhost:8080"];
```

---

## 🧰 Utilities

### Run migrations manually:

```bash
node migrate.js
```

### Roll back the last migration:

```bash
node migrate.js --rollback
```

### Reset the database (dev only):

```bash
node migrate.js --reset
```

---

## 💡 Notes

- Each router uses a shared MSSQL connection pool (`getPool()`).
- All queries are wrapped using `asyncHandler()` to ensure consistent error handling.
- The backend is fully modular and ready for future extensions like:
  - `POST /playlists` to create new playlists
  - `PUT /playlists/:id` to update titles
  - `DELETE /videos/:id` to remove entries

---

## 🧠 Author

**Greg Bastianelli**  
💻 [github.com/gerrgg](https://github.com/gerrgg)  
🌐 [idle.fm](https://idle.fm)

---

## 🪄 License

MIT License © 2025 Greg Bastianelli
