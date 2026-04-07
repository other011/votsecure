// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title VotSecure
 * @notice Smart contract pentru înregistrarea și verificarea voturilor on-chain.
 *         Stochează exclusiv hash-urile voturilor și metadate de integritate.
 *         Datele sensibile rămân off-chain (în PostgreSQL), blockchain-ul
 *         asigurând non-repudierea și trasabilitatea.
 *
 * Arhitectură off-chain/on-chain:
 *   OFF-CHAIN (PostgreSQL): date utilizatori, voturi criptate, sesiuni
 *   ON-CHAIN  (Ethereum):   hash-uri voturi, dovezi de integritate, audit
 */
contract VotSecure {

    // ─── STRUCTURI ────────────────────────────────────────────────────────────

    struct Election {
        bytes32 id;
        string  title;
        uint256 startTime;
        uint256 endTime;
        bool    active;
        address creator;
        uint256 totalVotes;
    }

    struct VoteRecord {
        bytes32 voteHash;       // SHA-256 al votului criptat (off-chain)
        bytes32 electionId;
        uint256 timestamp;
        uint256 blockNumber;
    }

    // ─── STARE ───────────────────────────────────────────────────────────────

    address public immutable owner;

    mapping(bytes32 => Election)   public elections;
    mapping(bytes32 => VoteRecord) public votes;
    mapping(bytes32 => mapping(bytes32 => bool)) public hasVoted; // electionId -> voterToken -> bool

    bytes32[] public electionIds;
    bytes32[] public voteHashes;

    // ─── EVENIMENTE ──────────────────────────────────────────────────────────

    event ElectionCreated(bytes32 indexed electionId, string title, uint256 startTime, uint256 endTime);
    event VoteCast(bytes32 indexed electionId, bytes32 indexed voteHash, uint256 timestamp);
    event ElectionClosed(bytes32 indexed electionId, uint256 totalVotes);

    // ─── MODIFICATORI ────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "VotSecure: only owner");
        _;
    }

    modifier electionExists(bytes32 electionId) {
        require(elections[electionId].creator != address(0), "VotSecure: election not found");
        _;
    }

    modifier electionActive(bytes32 electionId) {
        Election storage e = elections[electionId];
        require(e.active, "VotSecure: election not active");
        require(block.timestamp >= e.startTime, "VotSecure: election not started");
        require(block.timestamp <= e.endTime, "VotSecure: election ended");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ─── FUNCȚII PUBLICE ─────────────────────────────────────────────────────

    /**
     * @notice Creează o nouă alegere. Poate fi apelat doar de owner (backend).
     */
    function createElection(
        bytes32 electionId,
        string calldata title,
        uint256 startTime,
        uint256 endTime
    ) external onlyOwner {
        require(elections[electionId].creator == address(0), "VotSecure: already exists");
        require(endTime > startTime, "VotSecure: invalid time range");

        elections[electionId] = Election({
            id:         electionId,
            title:      title,
            startTime:  startTime,
            endTime:    endTime,
            active:     true,
            creator:    msg.sender,
            totalVotes: 0
        });

        electionIds.push(electionId);
        emit ElectionCreated(electionId, title, startTime, endTime);
    }

    /**
     * @notice Înregistrează hash-ul unui vot pe blockchain.
     *         Previne votul multiplu prin voterToken (hash anonim al alegătorului).
     * @param voteHash    SHA-256(votCriptat + nonce) - calculat off-chain
     * @param voterToken  Hash anonim al alegătorului (nu dezvăluie identitatea)
     */
    function castVote(
        bytes32 electionId,
        bytes32 voteHash,
        bytes32 voterToken
    ) external onlyOwner electionExists(electionId) electionActive(electionId) {
        require(!hasVoted[electionId][voterToken], "VotSecure: already voted");
        require(votes[voteHash].timestamp == 0, "VotSecure: duplicate vote hash");

        hasVoted[electionId][voterToken] = true;

        votes[voteHash] = VoteRecord({
            voteHash:    voteHash,
            electionId:  electionId,
            timestamp:   block.timestamp,
            blockNumber: block.number
        });

        elections[electionId].totalVotes++;
        voteHashes.push(voteHash);

        emit VoteCast(electionId, voteHash, block.timestamp);
    }

    /**
     * @notice Închide o alegere.
     */
    function closeElection(bytes32 electionId)
        external onlyOwner electionExists(electionId)
    {
        elections[electionId].active = false;
        emit ElectionClosed(electionId, elections[electionId].totalVotes);
    }

    /**
     * @notice Verifică dacă un hash de vot există pe blockchain (audit public).
     */
    function verifyVote(bytes32 voteHash)
        external view
        returns (bool exists, uint256 timestamp, uint256 blockNum)
    {
        VoteRecord storage r = votes[voteHash];
        return (r.timestamp != 0, r.timestamp, r.blockNumber);
    }

    function getElectionCount() external view returns (uint256) { return electionIds.length; }
    function getTotalVotes()    external view returns (uint256) { return voteHashes.length; }
}
