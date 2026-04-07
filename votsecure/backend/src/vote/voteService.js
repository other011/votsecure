/**
 * backend/src/vote/voteService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Serviciu de votare.
 * Responsabilitate: logica de business pentru exprimarea și numărarea voturilor.
 *
 * Flux castVote:
 *   1. Verifică că alegerea este activă
 *   2. Derivă voterToken anonim din userId
 *   3. Verifică că alegătorul nu a mai votat (BD + blockchain)
 *   4. Criptează payload-ul votului (AES-256-GCM)
 *   5. Salvează votul în PostgreSQL (tranzacție atomică)
 *   6. Înregistrează hash-ul pe blockchain (Ethereum)
 *   7. Actualizează tranzacția blockchain în BD
 *   8. Generează codul de verificare pentru alegător
 *   9. Loghează evenimentul în audit_log
 */

const { query, withTransaction } = require("../db/pool");
const crypto          = require("../crypto/cryptoService");
const blockchainSvc   = require("../blockchain/blockchainService");
const auditService    = require("../audit/auditService");
const emailService    = require("../email/emailService");
const logger          = require("../audit/logger");

// ─── EXPRIMARE VOT ───────────────────────────────────────────────────────────

/**
 * Procesează un vot.
 * @param {{ electionId, candidateId }} voteData
 * @param {string} userId     - ID-ul alegătorului autentificat
 * @param {string} ipAddress
 * @returns {{ receiptCode, voteHash, blockchainTx }}
 */
async function castVote({ electionId, candidateId }, userId, ipAddress) {
  // 1. Verifică alegerea
  const electionResult = await query(
    `SELECT id, status, blockchain_id FROM elections
     WHERE id = $1 AND status = 'active'
     AND start_time <= NOW() AND end_time >= NOW()`,
    [electionId]
  );

  if (electionResult.rowCount === 0) {
    throw new Error("Alegerea nu este activă sau nu există.");
  }
  const election = electionResult.rows[0];

  // 2. Verifică candidatul
  const candidateResult = await query(
    `SELECT id FROM candidates WHERE id = $1 AND election_id = $2`,
    [candidateId, electionId]
  );
  if (candidateResult.rowCount === 0) {
    throw new Error("Candidatul nu este valid pentru această alegere.");
  }

  // 3. Derivă token anonim
  const voterToken = crypto.deriveVoterToken(userId);

  // 4. Verifică vot anterior (constrângere UNIQUE în BD, dar verificăm explicit)
  const existingVote = await query(
    `SELECT id FROM votes WHERE voter_token = $1 AND election_id = $2`,
    [voterToken, electionId]
  );
  if (existingVote.rowCount > 0) {
    await auditService.log("VOTE_REJECTED_DUPLICATE", userId, ipAddress, { electionId });
    throw new Error("Ați votat deja în această alegere.");
  }

  // 5. Criptează payload-ul
  const { encrypted, nonce, authTag, voteHash } = crypto.encryptVote({
    candidateId,
    electionId,
    timestamp: Date.now(),
  });

  // 6. Generează cod de verificare
  const receiptCode = crypto.generateReceiptCode(voterToken, candidateId, nonce);

  // 7. Salvează în BD + înregistrează pe blockchain (tranzacție atomică în BD)
  let savedVote;
  try {
    savedVote = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO votes
           (election_id, voter_token, encrypted_payload, nonce, vote_hash,
            candidate_id, receipt_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, vote_hash, receipt_code, created_at`,
        [electionId, voterToken, encrypted + "|" + authTag, nonce,
         voteHash, candidateId, receiptCode]
      );
      return result.rows[0];
    });
  } catch (err) {
    if (err.code === "23505") { // PostgreSQL: unique_violation
      throw new Error("Ați votat deja în această alegere.");
    }
    throw err;
  }

  // 8. Înregistrează hash-ul pe blockchain (async, nu blochează răspunsul)
  let blockchainTx = null;
  try {
    const voterTokenBytes32 = "0x" + voterToken;
    const voteHashBytes32   = "0x" + voteHash;
    const electionBytes32   = election.blockchain_id;

    if (electionBytes32) {
      blockchainTx = await blockchainSvc.castVote(
        electionBytes32,
        voteHashBytes32,
        voterTokenBytes32
      );

      // Actualizează BD cu hash-ul tranzacției blockchain
      await query(
        `UPDATE votes SET blockchain_tx = $1 WHERE id = $2`,
        [blockchainTx, savedVote.id]
      );
    }
  } catch (bcErr) {
    // Blockchain-ul este un layer adițional — eșecul nu anulează votul din BD
    logger.warn("Blockchain castVote eșuat", { error: bcErr.message, voteHash });
  }

  // 9. Trimite email de confirmare (async)// Trimite email de confirmare
  // Trimite email de confirmare (async - nu blochează votarea)
  query(`SELECT name, email FROM users WHERE id = $1`, [userId])
    .then(userResult => {
      if (userResult.rowCount > 0) {
        const { name, email } = userResult.rows[0];
        emailService.sendVoteConfirmation({
          to: email, name, receiptCode, voteHash, electionTitle: election.title || electionId,
        }).catch(emailErr => logger.warn("Email confirmare vot eșuat", { error: emailErr.message }));
      }
    })
    .catch(err => logger.warn("Query email vot eșuat", { error: err.message }));

  await auditService.log("VOTE_CAST", userId, ipAddress, {
    electionId,
    voterTokenPrefix: voterToken.slice(0, 8) + "...",
    voteHashPrefix:   voteHash.slice(0, 8) + "...",
    blockchainTx,
  });

  logger.info("Vot înregistrat", { voteHashPrefix: voteHash.slice(0, 8), blockchainTx });

  return { receiptCode, voteHash: voteHash.slice(0, 16) + "...", blockchainTx };
}

// ─── NUMĂRARE VOTURI ─────────────────────────────────────────────────────────

/**
 * Numără voturile pentru o alegere.
 * Returnează rezultatele doar dacă alegerea este închisă (sau dacă e admin).
 *
 * @param {string} electionId
 * @param {boolean} isAdmin - Adminul poate vedea și în timp real
 * @returns {{ candidates: Array<{ id, name, party, votes, percentage }>, total }}
 */
async function tallyVotes(electionId, isAdmin = false) {
  const electionResult = await query(
    `SELECT id, title, status FROM elections WHERE id = $1`,
    [electionId]
  );
  if (electionResult.rowCount === 0) throw new Error("Alegerea nu există.");

  const election = electionResult.rows[0];
  if (election.status !== "closed" && !isAdmin) {
    throw new Error("Rezultatele sunt disponibile doar după încheierea alegerilor.");
  }

  const result = await query(
    `SELECT
       c.id, c.name, c.party, c.position,
       COUNT(v.id)::integer AS votes
     FROM candidates c
     LEFT JOIN votes v ON v.candidate_id = c.id AND v.election_id = $1
     WHERE c.election_id = $1
     GROUP BY c.id, c.name, c.party, c.position
     ORDER BY votes DESC, c.position ASC`,
    [electionId]
  );

  const total = result.rows.reduce((s, r) => s + r.votes, 0);
  const candidates = result.rows.map((r) => ({
    ...r,
    percentage: total > 0 ? Math.round((r.votes / total) * 10000) / 100 : 0,
  }));

  return { candidates, total, electionTitle: election.title, status: election.status };
}

// ─── VERIFICARE RECEIPT ───────────────────────────────────────────────────────

/**
 * Verifică dacă un cod de verificare există în BD și pe blockchain.
 * Nu dezvăluie candidatul votat.
 */
async function verifyReceipt(receiptCode, electionId) {
  const result = await query(
    `SELECT v.vote_hash, v.blockchain_tx, v.created_at
     FROM votes v
     WHERE v.receipt_code = $1 AND v.election_id = $2`,
    [receiptCode, electionId]
  );

  if (result.rowCount === 0) {
    return { found: false };
  }

  const vote = result.rows[0];

  // Verificare suplimentară pe blockchain
  let onChain = null;
  try {
    onChain = await blockchainSvc.verifyVote("0x" + vote.vote_hash);
  } catch {
    onChain = null;
  }

  return {
    found:       true,
    registeredAt: vote.created_at,
    blockchainTx: vote.blockchain_tx,
    onChain,
  };
}

module.exports = { castVote, tallyVotes, verifyReceipt };
