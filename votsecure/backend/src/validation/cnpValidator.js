/**
 * backend/src/validation/cnpValidator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modul de validare CNP (Cod Numeric Personal) conform specificațiilor.
 * Responsabilitate: validarea CNP la nivel de server (backend).
 * Aceeași logică este replicată și în frontend (src/utils/cnpValidator.js).
 *
 * Reguli validate:
 *   1. Exact 13 cifre
 *   2. Prima cifră: 1, 2, 5 sau 6
 *   3. Cifrele 2-3 (an): nu între 08 și 26
 *   4. Cifrele 4-5 (lună): ≤ 12
 *   5. Cifrele 6-7 (zi): ≤ 31
 *   6. Cifrele 8-9 (cod județ): ≤ 52
 */

/**
 * Validează un CNP românesc.
 * @param   {string} cnp - CNP-ul de validat
 * @returns {{ valid: boolean, error?: string }}
 */
function validateCNP(cnp) {
  // Regulă 1: exact 13 cifre
  if (typeof cnp !== "string" || !/^\d{13}$/.test(cnp)) {
    return { valid: false, error: "CNP invalid" };
  }

  const digits = cnp.split("").map(Number);

  // Regulă 2: prima cifră trebuie să fie 1, 2, 5 sau 6
  const validFirstDigits = [1, 2, 5, 6];
  if (!validFirstDigits.includes(digits[0])) {
    return { valid: false, error: "CNP invalid" };
  }

  // Regulă 3: cifrele 2-3 (indexuri 1-2) = an; nu trebuie să fie între 08 și 26
  const year = digits[1] * 10 + digits[2];
  if (year >= 8 && year <= 26) {
    return { valid: false, error: "CNP invalid" };
  }

  // Regulă 4: cifrele 4-5 (indexuri 3-4) = lună; trebuie ≤ 12 și ≥ 1
  const month = digits[3] * 10 + digits[4];
  if (month < 1 || month > 12) {
    return { valid: false, error: "CNP invalid" };
  }

  // Regulă 5: cifrele 6-7 (indexuri 5-6) = zi; trebuie ≤ 31 și ≥ 1
  const day = digits[5] * 10 + digits[6];
  if (day < 1 || day > 31) {
    return { valid: false, error: "CNP invalid" };
  }

  // Regulă 6: cifrele 8-9 (indexuri 7-8) = cod județ; trebuie ≤ 52 și ≥ 1
  const county = digits[7] * 10 + digits[8];
  if (county < 1 || county > 52) {
    return { valid: false, error: "CNP invalid" };
  }

  return { valid: true };
}

/**
 * Middleware Express pentru validarea CNP din request body.
 * Utilizat în ruta de înregistrare.
 */
function cnpMiddleware(req, res, next) {
  const { cnp } = req.body;
  if (!cnp) {
    return res.status(400).json({ error: "CNP invalid" });
  }
  const result = validateCNP(String(cnp).trim());
  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }
  next();
}

module.exports = { validateCNP, cnpMiddleware };
