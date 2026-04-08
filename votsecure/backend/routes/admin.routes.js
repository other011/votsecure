/**
 * backend/routes/admin.routes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Rute HTTP pentru panoul de administrare.
 * Toate rutele necesită autentificare + rol admin.
 *
 * POST /api/admin/elections            — creează alegere
 * PATCH /api/admin/elections/:id/close — închide alegere
 * GET  /api/admin/users                — listează alegători
 * GET  /api/admin/audit                — jurnal de audit
 * GET  /api/admin/stats                — statistici globale
 */

const express        = require("express");
const router         = express.Router();
const { query }      = require("../src/db/pool");
const blockchainSvc  = require("../src/blockchain/blockchainService");
const auditService   = require("../src/audit/auditService");
const crypto         = require("../src/crypto/cryptoService");
const { authenticate, requireAdmin, extractIp } = require("../src/middleware/authMiddleware");

// Toate rutele admin necesită autentificare + rol admin
router.use(authenticate, requireAdmin);

// ─── POST /api/admin/elections ───────────────────────────────────────────────
router.post("/elections", async (req, res) => {
  try {
    const { title, description, type, startTime, endTime, candidates } = req.body;

    if (!title || !startTime || !endTime || !candidates?.length) {
      return res.status(400).json({ error: "Câmpuri obligatorii lipsă." });
    }
    if (new Date(endTime) <= new Date(startTime)) {
      return res.status(400).json({ error: "endTime trebuie să fie după startTime." });
    }
    if (!candidates || candidates.length < 2) {
      return res.status(400).json({ error: "O alegere trebuie să aibă cel puțin 2 candidați." });
    }

    // Creează alegerea în BD
    const elResult = await query(
      `INSERT INTO elections (title, description, type, status, start_time, end_time, created_by)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6)
       RETURNING id, title, status, start_time, end_time`,
      [title, description || null, type || "uninominal",
       new Date(startTime), new Date(endTime), req.user.id]
    );
    const election = elResult.rows[0];

    // Adaugă candidații
    for (let i = 0; i < candidates.length; i++) {
      await query(
        `INSERT INTO candidates (election_id, name, party, position) VALUES ($1, $2, $3, $4)`,
        [election.id, candidates[i].name, candidates[i].party || null, i]
      );
    }

    // Activează alegerea
    await query(`UPDATE elections SET status = 'active' WHERE id = $1`, [election.id]);

    // Înregistrare pe blockchain (opțional — nu blochează)
    let blockchainId = null;
    try {
      const elIdBytes32 = "0x" + crypto.sha256(election.id).slice(0, 62).padEnd(64, "0");
      const txHash = await blockchainSvc.createElection(
        elIdBytes32, title,
        Math.floor(new Date(startTime).getTime() / 1000),
        Math.floor(new Date(endTime).getTime() / 1000)
      );
      blockchainId = elIdBytes32;
      await query(
        `UPDATE elections SET blockchain_id = $1, contract_tx_hash = $2 WHERE id = $3`,
        [blockchainId, txHash, election.id]
      );
    } catch (bcErr) {
      // Blockchain-ul este opțional — nu anulăm alegerea
    }

    await auditService.log("ELECTION_CREATED", req.user.id, extractIp(req), {
      electionId: election.id, title, blockchainId,
    });

    return res.status(201).json({
      message: "Alegere creată cu succes.",
      election: { ...election, status: "active", blockchain_id: blockchainId },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/admin/elections/:id/close ───────────────────────────────────
router.patch("/elections/:id/close", async (req, res) => {
  try {
    const result = await query(
      `UPDATE elections SET status = 'closed', closed_at = NOW()
       WHERE id = $1 AND status = 'active'
       RETURNING id, title, blockchain_id`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Alegerea nu există sau nu este activă." });
    }
    const election = result.rows[0];

    // Închide și pe blockchain
    if (election.blockchain_id) {
      try {
        await blockchainSvc.closeElection(election.blockchain_id);
      } catch { /* opțional */ }
    }

    await auditService.log("ELECTION_CLOSED", req.user.id, extractIp(req), {
      electionId: election.id, title: election.title,
    });

    return res.status(200).json({ message: "Alegerea a fost închisă.", election });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/admin/users ────────────────────────────────────────────────────
router.get("/users", async (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search}%` : "%";
    const result = await query(
      `SELECT id, name, email, role, is_active, created_at, last_login
       FROM users
       WHERE (name ILIKE $1 OR email ILIKE $1) AND role != 'admin'
       ORDER BY created_at DESC`,
      [search]
    );
    return res.status(200).json({ users: result.rows });
  } catch (err) {
    return res.status(500).json({ error: "Eroare internă." });
  }
});

// ─── GET /api/admin/audit ────────────────────────────────────────────────────
router.get("/audit", async (req, res) => {
  try {
    const limit     = Math.min(parseInt(req.query.limit) || 100, 500);
    const eventType = req.query.event || null;
    const events    = await auditService.getRecentEvents(limit, eventType);
    return res.status(200).json({ events });
  } catch (err) {
    return res.status(500).json({ error: "Eroare internă." });
  }
});

// ─── GET /api/admin/stats ────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const [usersRes, electionsRes, votesRes] = await Promise.all([
      query("SELECT COUNT(*) FROM users WHERE role = 'voter'"),
      query("SELECT status, COUNT(*) FROM elections GROUP BY status"),
      query("SELECT COUNT(*) FROM votes"),
    ]);

    let blockchainStats = null;
    try {
      blockchainStats = await blockchainSvc.getStats();
    } catch { /* opțional */ }

    return res.status(200).json({
      voters:     parseInt(usersRes.rows[0].count),
      elections:  electionsRes.rows,
      totalVotes: parseInt(votesRes.rows[0].count),
      blockchain: blockchainStats,
    });
  } catch (err) {
    return res.status(500).json({ error: "Eroare internă." });
  }
});

// ─── PATCH /api/admin/elections/:id/archive ──────────────────────────────────
router.patch("/elections/:id/archive", async (req, res) => {
  try {
    const result = await query(
      `UPDATE elections SET archived = true WHERE id = $1 AND status = 'closed' RETURNING id, title`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(400).json({ error: "Alegerea nu există sau nu este închisă. Doar alegerile închise pot fi arhivate." });
    }
    await auditService.log("ELECTION_ARCHIVED", req.user.id, extractIp(req), {
      electionId: req.params.id, title: result.rows[0].title,
    });
    return res.status(200).json({ message: "Alegerea a fost arhivată." });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
