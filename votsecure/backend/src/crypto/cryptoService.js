/**
 * backend/src/crypto/cryptoService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modul criptografic centralizat.
 * Responsabilitate: TOATE operațiile criptografice ale aplicației.
 *
 * Algoritmi utilizați:
 *   - SHA-256      : hash parole, hash voturi, token alegător
 *   - AES-256-GCM  : criptare payload vot (autentificat)
 *   - CSPRNG       : generare nonce și token-uri aleatoare
 *   - HMAC-SHA256  : generare cod de verificare (receipt)
 */

const crypto = require("crypto");

// ─── Constante ───────────────────────────────────────────────────────────────

const PEPPER          = process.env.PASSWORD_PEPPER    || "dev_pepper_schimbati_in_productie";
const VOTER_PEPPER    = process.env.VOTER_TOKEN_PEPPER || "dev_voter_pepper_schimbati";
const AES_KEY_HEX     = process.env.AES_KEY_HEX        || crypto.randomBytes(32).toString("hex");
const AES_KEY         = Buffer.from(AES_KEY_HEX, "hex");

// ─── Funcții helper ───────────────────────────────────────────────────────────

/**
 * Generează un șir hexadecimal aleatoriu de lungime `bytes` octeți.
 * Folosește CSPRNG (Cryptographically Secure Pseudo-Random Number Generator).
 */
function randomHex(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

// ─── Parole ───────────────────────────────────────────────────────────────────

/**
 * Calculează SHA-256(PEPPER + password).
 * Parola nu este niciodată stocată sau transmisă în clar.
 * @param   {string} password - Parola plaintext
 * @returns {string}          - Hash hexadecimal de 64 caractere
 */
function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(PEPPER + password)
    .digest("hex");
}

/**
 * Verifică o parolă față de hash-ul stocat.
 * Folosește comparație în timp constant pentru a preveni timing attacks.
 */
function verifyPassword(password, storedHash) {
  const computed = hashPassword(password);
  // timingSafeEqual previne timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(storedHash)
  );
}

// ─── Token alegător (anonimizare) ────────────────────────────────────────────

/**
 * Derivă un token anonim din ID-ul alegătorului.
 * SHA-256(VOTER_PEPPER + userId) — ireversibil.
 * Administratorul vede token-ul, NU user_id-ul original.
 */
function deriveVoterToken(userId) {
  return crypto
    .createHash("sha256")
    .update(VOTER_PEPPER + userId)
    .digest("hex");
}

// ─── Criptare vot ─────────────────────────────────────────────────────────────

/**
 * Criptează payload-ul votului cu AES-256-GCM.
 * GCM (Galois/Counter Mode) oferă atât confidențialitate cât și autentificare.
 *
 * @param {{ candidateId, electionId, timestamp }} payload
 * @returns {{ encrypted, nonce, authTag, voteHash }}
 */
function encryptVote(payload) {
  const nonce = crypto.randomBytes(12); // 96-bit IV pentru GCM (recomandat NIST)
  const cipher = crypto.createCipheriv("aes-256-gcm", AES_KEY, nonce);

  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag   = cipher.getAuthTag(); // tag de autentificare 128-bit

  const encryptedHex = encrypted.toString("base64");
  const nonceHex     = nonce.toString("hex");

  // Hash-ul votului = SHA-256(encrypted + nonce) — stocat și on-chain
  const voteHash = crypto
    .createHash("sha256")
    .update(encryptedHex + nonceHex)
    .digest("hex");

  return {
    encrypted: encryptedHex,
    nonce:     nonceHex,
    authTag:   authTag.toString("hex"),
    voteHash,
  };
}

/**
 * Decriptează un vot (folosit EXCLUSIV la numărare, de procese autorizate).
 */
function decryptVote(encrypted, nonceHex, authTagHex) {
  const nonce   = Buffer.from(nonceHex,   "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", AES_KEY, nonce);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

// ─── Cod de verificare (receipt) ─────────────────────────────────────────────

/**
 * Generează un cod de verificare unic pentru alegător.
 * HMAC-SHA256(voterToken + candidateId + nonce).slice(0, 16).toUpperCase()
 * Alegătorul poate verifica că votul a fost înregistrat fără a dezvălui opțiunea.
 */
function generateReceiptCode(voterToken, candidateId, nonce) {
  return crypto
    .createHmac("sha256", PEPPER)
    .update(voterToken + candidateId + nonce)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
}

// ─── Hash general ────────────────────────────────────────────────────────────

/** SHA-256 generic pentru orice string. */
function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** SHA-256 al unui JWT pentru stocare în sesiuni (nu stocăm JWT-ul în clar). */
function hashToken(token) {
  return sha256(token);
}

// ─── Export ──────────────────────────────────────────────────────────────────

module.exports = {
  randomHex,
  hashPassword,
  verifyPassword,
  deriveVoterToken,
  encryptVote,
  decryptVote,
  generateReceiptCode,
  sha256,
  hashToken,
};
