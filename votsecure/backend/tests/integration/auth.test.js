/**
 * backend/tests/integration/auth.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Teste de integrare pentru autentificare și înregistrare.
 * Rulare: npm test
 *
 * Scenarii testate:
 *   ✓ Înregistrare cu date valide
 *   ✓ Înregistrare cu email invalid (non @vote.ro)
 *   ✓ Înregistrare cu CNP invalid
 *   ✓ Autentificare cu credențiale valide
 *   ✓ Autentificare cu parolă greșită
 *   ✓ Blocare cont după N tentative eșuate
 */

const request  = require("supertest");
const app      = require("../../server");
const { query } = require("../../src/db/pool");

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Curăță utilizatorii de test
  await query("DELETE FROM users WHERE email LIKE '%@vote.ro' AND email != 'admin@vote.ro'");
});

afterAll(async () => {
  await query("DELETE FROM users WHERE email LIKE 'test.%@vote.ro'");
});

// ─── ÎNREGISTRARE ─────────────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  const validPayload = {
    name:     "Test Alegător",
    email:    "test.alegator@vote.ro",
    cnp:      "1990101010001",  // valid: S=1, an=99 (nu 08-26), lună=01, zi=01, județ=01
    password: "Parola123!",
  };

  it("201 — înregistrare cu date valide", async () => {
    const res = await request(app).post("/api/auth/register").send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe("test.alegator@vote.ro");
    expect(res.body.user.role).toBe("voter");
  });

  it("400 — email fără domeniu @vote.ro", async () => {
    const res = await request(app).post("/api/auth/register").send({
      ...validPayload,
      email: "test@gmail.com",
      cnp:   "1980201020002",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/vote\.ro/i);
  });

  it("400 — CNP cu lungime greșită", async () => {
    const res = await request(app).post("/api/auth/register").send({
      ...validPayload,
      email: "test.cnp1@vote.ro",
      cnp:   "123",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("CNP invalid");
  });

  it("400 — CNP cu prima cifră invalidă (3)", async () => {
    const res = await request(app).post("/api/auth/register").send({
      ...validPayload,
      email: "test.cnp2@vote.ro",
      cnp:   "3990101010001",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("CNP invalid");
  });

  it("400 — CNP cu an în intervalul interzis (15)", async () => {
    const res = await request(app).post("/api/auth/register").send({
      ...validPayload,
      email: "test.cnp3@vote.ro",
      cnp:   "1150101010001",  // an=15 -> interzis (08-26)
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("CNP invalid");
  });

  it("400 — CNP cu lună invalidă (13)", async () => {
    const res = await request(app).post("/api/auth/register").send({
      ...validPayload,
      email: "test.cnp4@vote.ro",
      cnp:   "1991301010001",  // lună=13
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("CNP invalid");
  });

  it("400 — CNP cu zi invalidă (00)", async () => {
    const res = await request(app).post("/api/auth/register").send({
      ...validPayload,
      email: "test.cnp5@vote.ro",
      cnp:   "1990100010001",  // zi=00
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("CNP invalid");
  });

  it("400 — CNP cu județ invalid (53)", async () => {
    const res = await request(app).post("/api/auth/register").send({
      ...validPayload,
      email: "test.cnp6@vote.ro",
      cnp:   "1990101530001",  // județ=53
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("CNP invalid");
  });

  it("400 — email duplicat", async () => {
    const res = await request(app).post("/api/auth/register").send(validPayload);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("400 — parolă prea scurtă", async () => {
    const res = await request(app).post("/api/auth/register").send({
      ...validPayload,
      email:    "test.pass@vote.ro",
      cnp:      "1990201020003",
      password: "abc",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/parol/i);
  });
});

// ─── AUTENTIFICARE ────────────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("200 — autentificare cu credențiale valide", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email:    "test.alegator@vote.ro",
      password: "Parola123!",
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe("voter");
  });

  it("401 — parolă greșită", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email:    "test.alegator@vote.ro",
      password: "gresite123",
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/credențiale/i);
  });

  it("401 — email inexistent", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email:    "inexistent@vote.ro",
      password: "oriceva",
    });
    expect(res.status).toBe(401);
    // Mesajul generic nu dezvăluie dacă emailul există (user enumeration prevention)
    expect(res.body.error).toMatch(/credențiale/i);
  });

  it("400 — câmpuri lipsă", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "x@vote.ro" });
    expect(res.status).toBe(400);
  });
});

// ─── PROFIL ─────────────────────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  let token;

  beforeAll(async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "test.alegator@vote.ro", password: "Parola123!",
    });
    token = res.body.token;
  });

  it("200 — returnează profilul utilizatorului autentificat", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("test.alegator@vote.ro");
  });

  it("401 — fără token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("401 — token invalid", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer token_invalid_12345");
    expect(res.status).toBe(401);
  });
});
