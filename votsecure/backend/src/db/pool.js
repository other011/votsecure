/**
 * backend/src/db/pool.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modul de conexiune la PostgreSQL folosind `pg` (node-postgres).
 * Exportă un Pool reutilizabil și o funcție `query` cu logging integrat.
 *
 * Responsabilitate: EXCLUSIV gestiunea conexiunii la baza de date.
 * Nu conține logică de business.
 */

const { Pool } = require("pg");
const logger   = require("../audit/logger");

// ─── Configurare pool ────────────────────────────────────────────────────────

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME     || "votsecure",
  user:     process.env.DB_USER     || "votsecure_user",
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : false,
  max:      20,           // conexiuni maxime în pool
  idleTimeoutMillis:    30_000,
  connectionTimeoutMillis: 5_000,
});

// Loghează erorile de conexiune (nu aruncă excepții negestionate)
pool.on("error", (err) => {
  logger.error("Pool PostgreSQL — eroare neașteptată", { error: err.message });
});

// ─── Funcție wrapper cu logging ──────────────────────────────────────────────

/**
 * Execută o interogare parametrizată.
 * @param {string}   text    - Interogare SQL cu parametri $1, $2, ...
 * @param {any[]}    params  - Valorile parametrilor
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug("DB query executată", { query: text.slice(0, 80), rows: result.rowCount, duration });
    return result;
  } catch (err) {
    logger.error("DB query eșuată", { query: text.slice(0, 80), error: err.message });
    throw err;
  }
}

/**
 * Execută mai multe interogări într-o tranzacție atomică.
 * @param {Function} fn - Funcție async care primește clientul și execută query-uri
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Verifică conexiunea la baza de date.
 */
async function healthCheck() {
  const result = await query("SELECT NOW() AS time, version() AS version");
  return result.rows[0];
}

module.exports = { pool, query, withTransaction, healthCheck };
