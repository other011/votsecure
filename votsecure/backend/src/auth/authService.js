/**
 * backend/src/auth/authService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Serviciu de autentificare și înregistrare.
 * Responsabilitate: logica de business pentru autentificare.
 *
 * Separă logica de business de controller-ul HTTP și de accesul la BD.
 */

const jwt          = require("jsonwebtoken");
const { query, withTransaction } = require("../db/pool");
const crypto       = require("../crypto/cryptoService");
const { validateCNP } = require("../validation/cnpValidator");
const logger       = require("../audit/logger");
const auditService = require("../audit/auditService");
const emailService = require("../email/emailService");

const JWT_SECRET     = process.env.JWT_SECRET     || "dev_secret_schimbati";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";
const MAX_ATTEMPTS   = 5;
const LOCK_MINUTES   = 15;

// ─── ÎNREGISTRARE ────────────────────────────────────────────────────────────

/**
 * Înregistrează un alegător nou.
 * Validează email (@vote.ro), CNP, unicitate și creează contul.
 *
 * @param {{ name, email, cnp, password }} data
 * @param {string} ipAddress
 * @returns {{ user, token }}
 */
async function register({ name, email, cnp, password }, ipAddress) {
  // Validare email
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail.includes("@") || !normalizedEmail.includes(".")) {
    throw new Error("Adresa de email nu este validă.");
  }

  // Validare CNP
  const cnpResult = validateCNP(String(cnp).trim());
  if (!cnpResult.valid) {
    throw new Error("CNP invalid");
  }

  // Validare parolă minimă
  if (!password || password.length < 6) {
    throw new Error("Parola trebuie să aibă cel puțin 6 caractere.");
  }

  // Unicitate email și CNP — verificare în tranzacție
  const user = await withTransaction(async (client) => {
    const existingEmail = await client.query(
      "SELECT id FROM users WHERE email = $1", [normalizedEmail]
    );
    if (existingEmail.rowCount > 0) {
      throw new Error("Există deja un cont cu această adresă de email.");
    }

    const existingCNP = await client.query(
      "SELECT id FROM users WHERE cnp = $1", [cnp.trim()]
    );
    if (existingCNP.rowCount > 0) {
      throw new Error("Există deja un cont cu acest CNP.");
    }

    const passwordHash = crypto.hashPassword(password);

    const result = await client.query(
      `INSERT INTO users (name, email, cnp, password_hash, role)
       VALUES ($1, $2, $3, $4, 'voter')
       RETURNING id, name, email, role, created_at`,
      [name.trim(), normalizedEmail, cnp.trim(), passwordHash]
    );

    return result.rows[0];
  });

// Trimite email de bun venit (async - nu blochează înregistrarea)
  emailService.sendWelcomeEmail({ to: user.email, name: user.name })
    .catch(emailErr => logger.warn("Email bun venit eșuat", { error: emailErr.message }));

  await auditService.log("USER_REGISTERED", user.id, ipAddress, {
    email: user.email,
    name: user.name,
  });

  const token = issueToken(user);
  logger.info("Utilizator înregistrat", { userId: user.id, email: user.email });

  return { user, token };
}

// ─── AUTENTIFICARE ───────────────────────────────────────────────────────────

/**
 * Autentifică un utilizator cu email și parolă.
 * Gestionează tentativele eșuate și blocarea contului.
 *
 * @param {{ email, password }} credentials
 * @param {string} ipAddress
 * @returns {{ user, token }}
 */
async function login({ email, password }, ipAddress) {
  const normalizedEmail = email.toLowerCase().trim();

  // Caută utilizatorul
  const result = await query(
    `SELECT id, name, email, role, password_hash, failed_attempts, locked_until, is_active
     FROM users WHERE email = $1`,
    [normalizedEmail]
  );

  // Răspuns generic — nu dezvăluim dacă emailul există (prevenire user enumeration)
  const genericError = "Credențiale invalide.";

  if (result.rowCount === 0) {
    await auditService.log("AUTH_FAIL_NO_USER", null, ipAddress, { email: normalizedEmail });
    throw new Error(genericError);
  }

  const user = result.rows[0];

  // Verificare cont activ
  if (!user.is_active) {
    throw new Error("Contul a fost dezactivat. Contactați administratorul.");
  }

  // Verificare blocare temporară
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    await auditService.log("AUTH_BLOCKED", user.id, ipAddress, { email: normalizedEmail });
    throw new Error(`Contul este blocat temporar. Reîncercați în ${remaining} minute.`);
  }

  // Verificare parolă
  let isValid = false;
  try {
    isValid = crypto.verifyPassword(password, user.password_hash);
  } catch {
    isValid = false;
  }

  if (!isValid) {
    // Incrementează tentativele eșuate
    const newAttempts = user.failed_attempts + 1;
    const lockUpdate  = newAttempts >= MAX_ATTEMPTS
      ? `, locked_until = NOW() + INTERVAL '${LOCK_MINUTES} minutes'`
      : "";

    await query(
      `UPDATE users SET failed_attempts = $1 ${lockUpdate} WHERE id = $2`,
      [newAttempts, user.id]
    );

    await auditService.log("AUTH_FAIL", user.id, ipAddress, {
      email: normalizedEmail,
      attempts: newAttempts,
    });

    if (newAttempts >= MAX_ATTEMPTS) {
      throw new Error(`Prea multe încercări. Contul a fost blocat ${LOCK_MINUTES} minute.`);
    }

    throw new Error(genericError);
  }

  // Autentificare reușită — resetează contorul
  await query(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1`,
    [user.id]
  );

  await auditService.log("AUTH_SUCCESS", user.id, ipAddress, { email: user.email });
  const token = issueToken(user);

  logger.info("Autentificare reușită", { userId: user.id, role: user.role });
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token,
  };
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

/**
 * Emite un JWT semnat pentru utilizatorul autentificat.
 */
function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: "HS256" }
  );
}

/**
 * Verifică și decodifică un JWT.
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
}

module.exports = { register, login, issueToken, verifyToken };
