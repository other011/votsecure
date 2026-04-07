/**
 * backend/routes/auth.routes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Rute HTTP pentru autentificare și înregistrare.
 * Responsabilitate: definirea endpoint-urilor REST, validare input, delegare
 *                   către authService.
 *
 * POST /api/auth/register  — înregistrare cont nou
 * POST /api/auth/login     — autentificare
 * POST /api/auth/logout    — deconectare (invalidare token client-side)
 * GET  /api/auth/me        — profil utilizator curent
 */

const express       = require("express");
const router        = express.Router();
const authService   = require("../src/auth/authService");
const { cnpMiddleware } = require("../src/validation/cnpValidator");
const { authenticate, extractIp } = require("../src/middleware/authMiddleware");

// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post("/register", cnpMiddleware, async (req, res) => {
  try {
    const { name, email, cnp, password } = req.body;

    if (!name || !email || !cnp || !password) {
      return res.status(400).json({ error: "Toate câmpurile sunt obligatorii." });
    }

    const ip = extractIp(req);
    const { user, token } = await authService.register(
      { name, email, cnp, password },
      ip
    );

    return res.status(201).json({
      message: "Cont creat cu succes.",
      user:  { id: user.id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email și parolă obligatorii." });
    }

    const ip = extractIp(req);
    const { user, token } = await authService.login({ email, password }, ip);

    return res.status(200).json({ user, token });
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
// Invalidarea JWT-ului se face client-side (ștergere token din storage).
// Opțional: backend-ul poate adăuga token-ul pe o blacklist în Redis/BD.
router.post("/logout", authenticate, (req, res) => {
  return res.status(200).json({ message: "Deconectat cu succes." });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get("/me", authenticate, async (req, res) => {
  try {
    const { query } = require("../src/db/pool");
    const result = await query(
      `SELECT id, name, email, role, created_at, last_login FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Utilizator negăsit." });
    return res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: "Eroare internă." });
  }
});

module.exports = router;
