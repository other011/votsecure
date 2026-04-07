const { Pool } = require("pg");
const logger   = require("../audit/logger");

console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host:     process.env.DB_HOST     || "localhost",
        port:     parseInt(process.env.DB_PORT || "5432"),
        database: process.env.DB_NAME     || "votsecure",
        user:     process.env.DB_USER     || "votsecure_user",
        password: process.env.DB_PASSWORD,
        ssl:      false,
      }
);

pool.on("error", (err) => {
  logger.error("Pool PostgreSQL — eroare neașteptată", { error: err.message });
});

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

async function healthCheck() {
  const result = await query("SELECT NOW() AS time, version() AS version");
  return result.rows[0];
}

module.exports = { pool, query, withTransaction, healthCheck };