/**
 * backend/src/blockchain/blockchainService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Interfață cu smart contractul VotSecure pe Ethereum.
 * Responsabilitate: toate interacțiunile cu blockchain-ul.
 *
 * Folosește ethers.js v6 pentru comunicarea cu nodul Ethereum.
 * Contractul adresă și ABI-ul sunt citite din config/ după deploy.
 */

const { ethers } = require("ethers");
const fs         = require("fs");
const path       = require("path");
const logger     = require("../audit/logger");

// ─── Inițializare provider și contract ───────────────────────────────────────

let provider, signer, contract;

function init() {
  try {
    const rpcUrl   = process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545";
    const privKey  = process.env.DEPLOYER_PRIVATE_KEY;
    const cfgPath  = path.join(__dirname, "../../../../config/contract-address.json");
    const abiPath  = path.join(__dirname, "../../../../config/VotSecure.abi.json");

    if (!fs.existsSync(cfgPath) || !fs.existsSync(abiPath)) {
      logger.warn("Blockchain: fișierele contract-address.json / VotSecure.abi.json lipsesc. Deploy contractul mai întâi.");
      return false;
    }

    const { contractAddress } = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));

    provider = new ethers.JsonRpcProvider(rpcUrl);
    signer   = new ethers.Wallet(privKey, provider);
    contract = new ethers.Contract(contractAddress, abi, signer);

    logger.info("Blockchain conectat", { contractAddress, rpcUrl });
    return true;
  } catch (err) {
    logger.error("Blockchain init eșuat", { error: err.message });
    return false;
  }
}

// ─── Funcții publice ──────────────────────────────────────────────────────────

/**
 * Creează o alegere pe blockchain.
 * @returns {string} Transaction hash
 */
async function createElection(electionId, title, startTime, endTime) {
  ensureReady();
  const tx = await contract.createElection(electionId, title, BigInt(startTime), BigInt(endTime));
  const receipt = await tx.wait();
  logger.info("Blockchain: alegere creată", { txHash: receipt.hash, electionId });
  return receipt.hash;
}

/**
 * Înregistrează hash-ul unui vot pe blockchain.
 * @returns {string} Transaction hash
 */
async function castVote(electionId, voteHash, voterToken) {
  ensureReady();
  const tx = await contract.castVote(electionId, voteHash, voterToken);
  const receipt = await tx.wait();
  logger.info("Blockchain: vot înregistrat", { txHash: receipt.hash });
  return receipt.hash;
}

/**
 * Închide o alegere pe blockchain.
 */
async function closeElection(electionId) {
  ensureReady();
  const tx = await contract.closeElection(electionId);
  await tx.wait();
}

/**
 * Verifică dacă un hash de vot există pe blockchain (audit public).
 * @returns {{ exists, timestamp, blockNumber }}
 */
async function verifyVote(voteHash) {
  ensureReady();
  const [exists, timestamp, blockNumber] = await contract.verifyVote(voteHash);
  return {
    exists,
    timestamp: exists ? new Date(Number(timestamp) * 1000).toISOString() : null,
    blockNumber: exists ? Number(blockNumber) : null,
  };
}

/**
 * Returnează statistici de pe blockchain.
 */
async function getStats() {
  ensureReady();
  const [electionCount, totalVotes] = await Promise.all([
    contract.getElectionCount(),
    contract.getTotalVotes(),
  ]);
  return { electionCount: Number(electionCount), totalVotes: Number(totalVotes) };
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function ensureReady() {
  if (!contract) {
    const ok = init();
    if (!ok) throw new Error("Blockchain indisponibil. Verificați configurația.");
  }
}

function isAvailable() {
  if (!contract) return init();
  return true;
}

// Inițializare la import
init();

module.exports = { createElection, castVote, closeElection, verifyVote, getStats, isAvailable };
