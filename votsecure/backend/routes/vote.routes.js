/**
 * backend/routes/vote.routes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Rute HTTP pentru exprimarea voturilor și consultarea rezultatelor.
 *
 * POST /api/vote/cast                    — exprimă un vot
 * GET  /api/vote/elections               — listează alegerile disponibile
 * GET  /api/vote/elections/:id/results   — rezultate alegere
 * POST /api/vote/verify                  — verifică cod de chitanță
 */

const express     = require("express");
const router      = express.Router();
const voteService = require("../src/vote/voteService");
const { authenticate, requireVoter, extractIp } = require("../src/middleware/authMiddleware");
const { query }   = require("../src/db/pool");

// ─── POST /api/vote/cast ─────────────────────────────────────────────────────
router.post("/cast", authenticate, requireVoter, async (req, res) => {
  try {
    const { electionId, candidateId } = req.body;
    if (!electionId || !candidateId) {
      return res.status(400).json({ error: "electionId și candidateId sunt obligatorii." });
    }

    const ip = extractIp(req);
    const result = await voteService.castVote(
      { electionId, candidateId },
      req.user.id,
      ip
    );

    return res.status(201).json({
      message:      "Vot înregistrat cu succes.",
      receiptCode:  result.receiptCode,
      voteHash:     result.voteHash,
      blockchainTx: result.blockchainTx,
    });
  } catch (err) {
    const status = err.message.includes("deja") ? 409 : 400;
    return res.status(status).json({ error: err.message });
  }
});

// ─── GET /api/vote/elections ─────────────────────────────────────────────────
router.get("/elections", authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT
         e.id, e.title, e.description, e.type, e.status,
         e.start_time, e.end_time, e.blockchain_id,
         COUNT(c.id) AS candidate_count,
         u.name AS created_by_name
       FROM elections e
       LEFT JOIN candidates c ON c.election_id = e.id
       LEFT JOIN users u ON u.id = e.created_by
       GROUP BY e.id, u.name
       ORDER BY e.start_time DESC`
    );
    return res.status(200).json({ elections: result.rows });
  } catch (err) {
    return res.status(500).json({ error: "Eroare internă." });
  }
});

// ─── GET /api/vote/elections/:id ─────────────────────────────────────────────
router.get("/elections/:id", authenticate, async (req, res) => {
  try {
    const elResult = await query(
      `SELECT e.*, u.name AS created_by_name
       FROM elections e LEFT JOIN users u ON u.id = e.created_by
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (elResult.rowCount === 0) return res.status(404).json({ error: "Alegerea nu există." });

    const candResult = await query(
      `SELECT id, name, party, position FROM candidates WHERE election_id = $1 ORDER BY position`,
      [req.params.id]
    );

    // Verifică dacă alegătorul a votat deja
    let hasVoted = false;
    if (req.user.role === "voter") {
      const crypto = require("../src/crypto/cryptoService");
      const voterToken = crypto.deriveVoterToken(req.user.id);
      const voteCheck = await query(
        `SELECT id FROM votes WHERE voter_token = $1 AND election_id = $2`,
        [voterToken, req.params.id]
      );
      hasVoted = voteCheck.rowCount > 0;
    }

    return res.status(200).json({
      election:   elResult.rows[0],
      candidates: candResult.rows,
      hasVoted,
    });
  } catch (err) {
    return res.status(500).json({ error: "Eroare internă." });
  }
});

// ─── GET /api/vote/elections/:id/results ────────────────────────────────────
router.get("/elections/:id/results", authenticate, async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const results = await voteService.tallyVotes(req.params.id, isAdmin);
    return res.status(200).json(results);
  } catch (err) {
    const status = err.message.includes("disponibile") ? 403 : 400;
    return res.status(status).json({ error: err.message });
  }
});

// ─── POST /api/vote/verify ───────────────────────────────────────────────────
router.post("/verify", authenticate, async (req, res) => {
  try {
    const { receiptCode, electionId } = req.body;
    if (!receiptCode || !electionId) {
      return res.status(400).json({ error: "receiptCode și electionId sunt obligatorii." });
    }
    const result = await voteService.verifyReceipt(receiptCode, electionId);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
