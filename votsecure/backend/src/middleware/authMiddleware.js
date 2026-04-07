/**
 * backend/src/middleware/authMiddleware.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Middleware Express pentru autentificare și autorizare.
 * Responsabilitate: verificarea JWT și injectarea utilizatorului în request.
 */

const { verifyToken } = require("../auth/authService");
const logger          = require("../audit/logger");

/**
 * Verifică JWT-ul din header-ul Authorization: Bearer <token>.
 * Injectează `req.user` cu { id, email, role }.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = verifyToken(token);
    req.user = { id: decoded.sub, email: decoded.email, role: decoded.role };
    next();
  } catch (err) {
    logger.warn("JWT invalid", { error: err.message });
    return res.status(401).json({ error: "Token invalid sau expirat." });
  }
}

/**
 * Verifică că utilizatorul are rolul 'admin'.
 * Se folosește după `authenticate`.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Acces interzis. Rol administrator necesar." });
  }
  next();
}

/**
 * Verifică că utilizatorul are rolul 'voter'.
 */
function requireVoter(req, res, next) {
  if (!req.user || req.user.role !== "voter") {
    return res.status(403).json({ error: "Acces interzis." });
  }
  next();
}

/**
 * Extrage IP-ul real al clientului (suport proxy).
 */
function extractIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

module.exports = { authenticate, requireAdmin, requireVoter, extractIp };
