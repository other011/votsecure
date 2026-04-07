/**
 * backend/src/audit/auditService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Serviciu de audit — înregistrează evenimente în tabela audit_log (PostgreSQL).
 * Responsabilitate: jurnalizarea structurată a tuturor evenimentelor relevante.
 *
 * Tabela audit_log este imutabilă (fără UPDATE/DELETE).
 */

const { query } = require("../db/pool");
const logger    = require("./logger");

/**
 * Tipuri de evenimente suportate:
 *   AUTH_SUCCESS, AUTH_FAIL, AUTH_FAIL_NO_USER, AUTH_BLOCKED,
 *   USER_REGISTERED,
 *   VOTE_CAST, VOTE_REJECTED_DUPLICATE,
 *   ELECTION_CREATED, ELECTION_CLOSED,
 *   AUDIT_RUN, ADMIN_ACTION
 */

/**
 * Înregistrează un eveniment în audit_log.
 * @param {string}  eventType  - Tipul evenimentului (din lista de mai sus)
 * @param {string|null} userId - ID-ul utilizatorului (null dacă necunoscut)
 * @param {string}  ipAddress  - IP-ul clientului
 * @param {object}  detail     - Date suplimentare (stocate ca JSONB)
 */
async function log(eventType, userId = null, ipAddress = null, detail = {}) {
  try {
    await query(
      `INSERT INTO audit_log (event_type, user_id, ip_address, detail)
       VALUES ($1, $2, $3::inet, $4)`,
      [eventType, userId, ipAddress, JSON.stringify(detail)]
    );
  } catch (err) {
    // Nu aruncăm excepția — audit-ul nu trebuie să oprească fluxul principal
    logger.error("Audit log eșuat", { eventType, error: err.message });
  }
}

/**
 * Returnează ultimele N evenimente din audit_log.
 * Disponibil doar pentru administratori.
 */
async function getRecentEvents(limit = 100, eventType = null) {
  const params = eventType ? [limit, eventType] : [limit];
  const filter = eventType ? "AND event_type = $2" : "";

  const result = await query(
    `SELECT
       al.id, al.event_type, al.ip_address,
       al.detail, al.created_at,
       u.name AS user_name, u.email AS user_email
     FROM audit_log al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE 1=1 ${filter}
     ORDER BY al.created_at DESC
     LIMIT $1`,
    params
  );
  return result.rows;
}

module.exports = { log, getRecentEvents };
