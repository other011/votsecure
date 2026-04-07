/**
 * backend/tests/unit/cnpValidator.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Teste unitare pentru modulul de validare CNP.
 */

const { validateCNP } = require("../../src/validation/cnpValidator");

describe("validateCNP", () => {

  // ─── CNP-uri VALIDE ────────────────────────────────────────────────────────

  describe("CNP-uri valide", () => {
    const validCNPs = [
      "1990101010001",  // M, an=99, lună=01, zi=01, județ=01
      "2990601520005",  // F, an=99, lună=06, zi=01, județ=52
      "5991201010001",  // rezident M, an=99
      "6990501010001",  // rezident F, an=99
      "1800101010001",  // an=80 (nu e în 08-26)
      "1270101010001",  // an=27 (nu e în 08-26)
    ];

    validCNPs.forEach(cnp => {
      it(`✓ ${cnp} este valid`, () => {
        expect(validateCNP(cnp).valid).toBe(true);
      });
    });
  });

  // ─── REGULA 1: Lungime ─────────────────────────────────────────────────────

  describe("Regula 1 — Lungime exactă 13 cifre", () => {
    it("invalid — șir gol", ()         => expect(validateCNP("").valid).toBe(false));
    it("invalid — null",   ()          => expect(validateCNP(null).valid).toBe(false));
    it("invalid — 12 cifre", ()        => expect(validateCNP("199010101000").valid).toBe(false));
    it("invalid — 14 cifre", ()        => expect(validateCNP("19901010100011").valid).toBe(false));
    it("invalid — conține litere", ()  => expect(validateCNP("199010101000A").valid).toBe(false));
    it("invalid — conține spații", ()  => expect(validateCNP("1990101 10001").valid).toBe(false));
  });

  // ─── REGULA 2: Prima cifră ─────────────────────────────────────────────────

  describe("Regula 2 — Prima cifră: 1, 2, 5 sau 6", () => {
    [0, 3, 4, 7, 8, 9].forEach(d => {
      it(`invalid — prima cifră ${d}`, () => {
        expect(validateCNP(`${d}990101010001`).valid).toBe(false);
        expect(validateCNP(`${d}990101010001`).error).toBe("CNP invalid");
      });
    });

    [1, 2, 5, 6].forEach(d => {
      it(`valid — prima cifră ${d}`, () => {
        expect(validateCNP(`${d}990101010001`).valid).toBe(true);
      });
    });
  });

  // ─── REGULA 3: An 08-26 interzis ──────────────────────────────────────────

  describe("Regula 3 — Cifrele 2-3 (an): nu între 08 și 26", () => {
    for (let year = 8; year <= 26; year++) {
      const yStr = String(year).padStart(2, "0");
      it(`invalid — an=${yStr}`, () => {
        expect(validateCNP(`1${yStr}0101010001`).valid).toBe(false);
      });
    }

    [7, 27, 50, 99, "00"].forEach(year => {
      const yStr = String(year).padStart(2, "0");
      it(`valid — an=${yStr}`, () => {
        // an=00 cu prima cifră 5 sau 6 ar trebui să fie valid
        const cnp = `1${yStr}0101010001`;
        const result = validateCNP(cnp);
        expect(result.valid).toBe(true);
      });
    });
  });

  // ─── REGULA 4: Lună ────────────────────────────────────────────────────────

  describe("Regula 4 — Luna (cifrele 4-5): 01-12", () => {
    it("invalid — lună 00", () => expect(validateCNP("1990001010001").valid).toBe(false));
    it("invalid — lună 13", () => expect(validateCNP("1991301010001").valid).toBe(false));
    it("invalid — lună 99", () => expect(validateCNP("1999901010001").valid).toBe(false));
    it("valid   — lună 01", () => expect(validateCNP("1990101010001").valid).toBe(true));
    it("valid   — lună 12", () => expect(validateCNP("1991201010001").valid).toBe(true));
  });

  // ─── REGULA 5: Zi ─────────────────────────────────────────────────────────

  describe("Regula 5 — Ziua (cifrele 6-7): 01-31", () => {
    it("invalid — zi 00", () => expect(validateCNP("1990100010001").valid).toBe(false));
    it("invalid — zi 32", () => expect(validateCNP("1990103210001").valid).toBe(false));
    it("valid   — zi 01", () => expect(validateCNP("1990101010001").valid).toBe(true));
    it("valid   — zi 31", () => expect(validateCNP("1990103110001").valid).toBe(true));
  });

  // ─── REGULA 6: Județ ──────────────────────────────────────────────────────

  describe("Regula 6 — Cod județ (cifrele 8-9): 01-52", () => {
    it("invalid — județ 00", () => expect(validateCNP("1990101000001").valid).toBe(false));
    it("invalid — județ 53", () => expect(validateCNP("1990101530001").valid).toBe(false));
    it("invalid — județ 99", () => expect(validateCNP("1990101990001").valid).toBe(false));
    it("valid   — județ 01", () => expect(validateCNP("1990101010001").valid).toBe(true));
    it("valid   — județ 52", () => expect(validateCNP("1990101520001").valid).toBe(true));
  });

  // ─── Mesaj de eroare ──────────────────────────────────────────────────────

  describe("Mesaj de eroare", () => {
    it("returnează exact 'CNP invalid' pentru orice eroare", () => {
      const cases = ["", "abc", "123", "3990101010001", "1150101010001"];
      cases.forEach(cnp => {
        const result = validateCNP(cnp);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("CNP invalid");
      });
    });
  });
});
