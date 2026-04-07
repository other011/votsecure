/**
 * backend/server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Punctul de intrare al serverului Express.
 * Responsabilitate: configurare middleware global, montare rute, pornire server.
 *
 * Rulare:
 *   npm run dev   — nodemon (development)
 *   npm start     — producție
 */

require("dotenv").config({ path: "../config/.env" });
require("dotenv").config(); // fallback pentru Railway

const express     = require("express");
const cors        = require("cors");
const helmet      = require("helmet");
const rateLimit   = require("express-rate-limit");
const logger      = require("./src/audit/logger");
const { healthCheck } = require("./src/db/pool");

// ─── Rute ────────────────────────────────────────────────────────────────────
const authRoutes  = require("./routes/auth.routes");
const voteRoutes  = require("./routes/vote.routes");
const adminRoutes = require("./routes/admin.routes");

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware global ────────────────────────────────────────────────────────

// Securitate HTTP headers
app.use(helmet());

// CORS — permite doar originea frontend-ului
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000", process.env.CORS_ORIGIN].filter(Boolean),
  credentials: true,
}));

// Parsare JSON body
app.use(express.json({ limit: "10kb" })); // limită pentru a preveni DoS

// Rate limiting global — 100 req/15 min per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  message:  { error: "Prea multe cereri. Reîncercați mai târziu." },
  standardHeaders: true,
  legacyHeaders:   false,
}));

// Rate limiting strict pentru autentificare — 10 req/15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { error: "Prea multe încercări de autentificare." },
});

// ─── Montare rute ─────────────────────────────────────────────────────────────

app.use("/api/auth",  authLimiter, authRoutes);
app.use("/api/vote",  voteRoutes);
app.use("/api/admin", adminRoutes);

// ─── Health check ────────────────────────────────────────────────────────────

app.get("/health", async (req, res) => {
  try {
    const db = await healthCheck();
    res.status(200).json({
      status: "ok",
      db:     { connected: true, time: db.time },
      server: { uptime: process.uptime(), env: process.env.NODE_ENV },
    });
  } catch (err) {
    res.status(503).json({ status: "error", db: { connected: false } });
  }
});

// ─── Error handler global ─────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  logger.error("Eroare neprinsă în server", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Eroare internă de server." });
});

// ─── Pornire server ───────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  logger.info(`VotSecure backend pornit pe portul ${PORT}`);
  try {
    const db = await healthCheck();
    logger.info("PostgreSQL conectat", { time: db.time });
  } catch (err) {
    logger.error("PostgreSQL indisponibil", { error: err.message });
  }
});

module.exports = app; // pentru teste
