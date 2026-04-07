/**
 * frontend/src/utils/cnpValidator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Validare CNP pe frontend — logică identică cu backend-ul.
 * Responsabilitate: feedback imediat pentru utilizator, fără a elimina
 *                   validarea de pe server (defense-in-depth).
 *
 * Reguli:
 *   1. Exact 13 cifre
 *   2. Prima cifră: 1, 2, 5 sau 6
 *   3. Cifrele 2-3 (an): nu între 08 și 26
 *   4. Cifrele 4-5 (lună): ≤ 12 și ≥ 1
 *   5. Cifrele 6-7 (zi): ≤ 31 și ≥ 1
 *   6. Cifrele 8-9 (cod județ): ≤ 52 și ≥ 1
 */

/**
 * @param {string} cnp
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCNP(cnp) {
  if (!cnp || !/^\d{13}$/.test(cnp)) {
    return { valid: false, error: "CNP invalid" };
  }

  const d = cnp.split("").map(Number);

  // Regula 2: prima cifră
  if (![1, 2, 5, 6].includes(d[0])) {
    return { valid: false, error: "CNP invalid" };
  }

  // Regula 3: an (cifrele 2-3, indexuri 1-2)
  const year = d[1] * 10 + d[2];
  if (year >= 8 && year <= 26) {
    return { valid: false, error: "CNP invalid" };
  }

  // Regula 4: lună (cifrele 4-5, indexuri 3-4)
  const month = d[3] * 10 + d[4];
  if (month < 1 || month > 12) {
    return { valid: false, error: "CNP invalid" };
  }

  // Regula 5: zi (cifrele 6-7, indexuri 5-6)
  const day = d[5] * 10 + d[6];
  if (day < 1 || day > 31) {
    return { valid: false, error: "CNP invalid" };
  }

  // Regula 6: județ (cifrele 8-9, indexuri 7-8)
  const county = d[7] * 10 + d[8];
  if (county < 1 || county > 52) {
    return { valid: false, error: "CNP invalid" };
  }

  return { valid: true };
}

/**
 * Returnează hint vizual în timp real pe măsură ce utilizatorul tastează.
 * @param {string} cnp
 * @returns {{ status: 'empty'|'typing'|'invalid'|'valid', message: string }}
 */
export function cnpHint(cnp) {
  if (!cnp) return { status: "empty", message: "" };
  if (cnp.length < 13) return { status: "typing", message: `${cnp.length}/13 cifre` };
  if (!/^\d{13}$/.test(cnp)) return { status: "invalid", message: "CNP invalid" };
  const result = validateCNP(cnp);
  return result.valid
    ? { status: "valid",   message: "CNP valid ✓" }
    : { status: "invalid", message: result.error };
}
