/**
 * backend/tests/unit/cryptoService.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Teste unitare pentru modulul criptografic.
 */

const crypto = require("../../src/crypto/cryptoService");

describe("cryptoService", () => {

  // ─── hashPassword ──────────────────────────────────────────────────────────

  describe("hashPassword", () => {
    it("returnează un hex de 64 caractere (SHA-256)", () => {
      const h = crypto.hashPassword("parola123");
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it("același input produce același output (deterministic)", () => {
      expect(crypto.hashPassword("abc")).toBe(crypto.hashPassword("abc"));
    });

    it("input-uri diferite produc hash-uri diferite", () => {
      expect(crypto.hashPassword("parola1")).not.toBe(crypto.hashPassword("parola2"));
    });
  });

  // ─── verifyPassword ────────────────────────────────────────────────────────

  describe("verifyPassword", () => {
    it("verifică corect o parolă validă", () => {
      const hash = crypto.hashPassword("parolaMea123");
      expect(crypto.verifyPassword("parolaMea123", hash)).toBe(true);
    });

    it("respinge o parolă greșită", () => {
      const hash = crypto.hashPassword("parolaMea123");
      expect(crypto.verifyPassword("gresite", hash)).toBe(false);
    });
  });

  // ─── deriveVoterToken ─────────────────────────────────────────────────────

  describe("deriveVoterToken", () => {
    it("returnează un token hex de 64 caractere", () => {
      expect(crypto.deriveVoterToken("user-id-123")).toMatch(/^[0-9a-f]{64}$/);
    });

    it("token-uri diferite pentru userId-uri diferite", () => {
      expect(crypto.deriveVoterToken("user1")).not.toBe(crypto.deriveVoterToken("user2"));
    });

    it("token-ul este deterministic pentru același userId", () => {
      expect(crypto.deriveVoterToken("abc")).toBe(crypto.deriveVoterToken("abc"));
    });

    it("token-ul NU conține userId-ul original (ireversibil)", () => {
      const token = crypto.deriveVoterToken("utilizator-secret");
      expect(token).not.toContain("utilizator-secret");
    });
  });

  // ─── encryptVote / decryptVote ────────────────────────────────────────────

  describe("encryptVote + decryptVote", () => {
    const payload = { candidateId: "cand-1", electionId: "el-2024", timestamp: 1700000000000 };

    it("criptează și decriptează corect payload-ul", () => {
      const { encrypted, nonce, authTag } = crypto.encryptVote(payload);
      const decrypted = crypto.decryptVote(encrypted, nonce, authTag);
      expect(decrypted.candidateId).toBe(payload.candidateId);
      expect(decrypted.electionId).toBe(payload.electionId);
    });

    it("produce voteHash hex de 64 caractere", () => {
      const { voteHash } = crypto.encryptVote(payload);
      expect(voteHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("nonce-uri diferite → hash-uri diferite (non-deterministic)", () => {
      const h1 = crypto.encryptVote(payload).voteHash;
      const h2 = crypto.encryptVote(payload).voteHash;
      expect(h1).not.toBe(h2);
    });

    it("decriptare cu authTag greșit aruncă eroare (GCM integrity)", () => {
      const { encrypted, nonce } = crypto.encryptVote(payload);
      expect(() => crypto.decryptVote(encrypted, nonce, "00".repeat(16))).toThrow();
    });
  });

  // ─── generateReceiptCode ──────────────────────────────────────────────────

  describe("generateReceiptCode", () => {
    it("returnează un cod de 16 caractere uppercase hex", () => {
      const code = crypto.generateReceiptCode("token", "cand-1", "nonce123");
      expect(code).toMatch(/^[0-9A-F]{16}$/);
    });

    it("cod diferit pentru nonce diferit", () => {
      const c1 = crypto.generateReceiptCode("token", "cand-1", "nonce1");
      const c2 = crypto.generateReceiptCode("token", "cand-1", "nonce2");
      expect(c1).not.toBe(c2);
    });
  });

  // ─── randomHex ────────────────────────────────────────────────────────────

  describe("randomHex", () => {
    it("generează șiruri unice (CSPRNG)", () => {
      const vals = new Set(Array.from({ length: 1000 }, () => crypto.randomHex(16)));
      expect(vals.size).toBe(1000);
    });

    it("lungimea corectă: N bytes → 2N hex chars", () => {
      expect(crypto.randomHex(16)).toHaveLength(32);
      expect(crypto.randomHex(8)).toHaveLength(16);
    });
  });
});
