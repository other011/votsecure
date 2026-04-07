/**
 * test/VotSecure.test.js
 * Suite de teste pentru contractul VotSecure.
 * Rulare: npx hardhat test
 */

const { expect }  = require("chai");
const { ethers }  = require("hardhat");
const { time }    = require("@nomicfoundation/hardhat-network-helpers");

describe("VotSecure", function () {
  let contract, owner, addr1;

  // ID-uri de test
  const electionId  = ethers.encodeBytes32String("ELECTION_2024");
  const voteHash1   = ethers.keccak256(ethers.toUtf8Bytes("vote_payload_1"));
  const voterToken1 = ethers.keccak256(ethers.toUtf8Bytes("voter_anon_token_1"));
  const voteHash2   = ethers.keccak256(ethers.toUtf8Bytes("vote_payload_2"));
  const voterToken2 = ethers.keccak256(ethers.toUtf8Bytes("voter_anon_token_2"));

  let startTime, endTime;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    const VotSecure = await ethers.getContractFactory("VotSecure");
    contract = await VotSecure.deploy();

    const now = await time.latest();
    startTime = now - 10;
    endTime   = now + 86400; // +24h
  });

  // ─── CREARE ALEGERE ───────────────────────────────────────────────────────

  describe("createElection", function () {
    it("owner poate crea o alegere validă", async function () {
      await expect(contract.createElection(electionId, "Test Alegere", startTime, endTime))
        .to.emit(contract, "ElectionCreated")
        .withArgs(electionId, "Test Alegere", startTime, endTime);

      const e = await contract.elections(electionId);
      expect(e.active).to.equal(true);
      expect(e.totalVotes).to.equal(0n);
    });

    it("non-owner NU poate crea alegeri", async function () {
      await expect(
        contract.connect(addr1).createElection(electionId, "Hack", startTime, endTime)
      ).to.be.revertedWith("VotSecure: only owner");
    });

    it("nu se poate crea o alegere duplicat", async function () {
      await contract.createElection(electionId, "First", startTime, endTime);
      await expect(
        contract.createElection(electionId, "Second", startTime, endTime)
      ).to.be.revertedWith("VotSecure: already exists");
    });

    it("endTime trebuie să fie după startTime", async function () {
      await expect(
        contract.createElection(electionId, "Bad", endTime, startTime)
      ).to.be.revertedWith("VotSecure: invalid time range");
    });
  });

  // ─── VOTARE ──────────────────────────────────────────────────────────────

  describe("castVote", function () {
    beforeEach(async function () {
      await contract.createElection(electionId, "Alegeri Test", startTime, endTime);
    });

    it("înregistrează un vot valid", async function () {
      await expect(contract.castVote(electionId, voteHash1, voterToken1))
        .to.emit(contract, "VoteCast")
        .withArgs(electionId, voteHash1, await time.latest() + 1);

      const record = await contract.votes(voteHash1);
      expect(record.timestamp).to.be.gt(0n);

      const e = await contract.elections(electionId);
      expect(e.totalVotes).to.equal(1n);
    });

    it("previne votul multiplu pentru același alegător", async function () {
      await contract.castVote(electionId, voteHash1, voterToken1);
      await expect(
        contract.castVote(electionId, voteHash2, voterToken1)
      ).to.be.revertedWith("VotSecure: already voted");
    });

    it("previne hash-ul de vot duplicat", async function () {
      await contract.castVote(electionId, voteHash1, voterToken1);
      await expect(
        contract.castVote(electionId, voteHash1, voterToken2)
      ).to.be.revertedWith("VotSecure: duplicate vote hash");
    });

    it("non-owner NU poate vota direct", async function () {
      await expect(
        contract.connect(addr1).castVote(electionId, voteHash1, voterToken1)
      ).to.be.revertedWith("VotSecure: only owner");
    });

    it("nu se poate vota după încheierea alegerii", async function () {
      await time.increase(86401); // +25h
      await expect(
        contract.castVote(electionId, voteHash1, voterToken1)
      ).to.be.revertedWith("VotSecure: election ended");
    });
  });

  // ─── AUDIT & VERIFICARE ───────────────────────────────────────────────────

  describe("verifyVote", function () {
    beforeEach(async function () {
      await contract.createElection(electionId, "Alegeri Test", startTime, endTime);
      await contract.castVote(electionId, voteHash1, voterToken1);
    });

    it("confirmă existența unui vot valid", async function () {
      const [exists, ts] = await contract.verifyVote(voteHash1);
      expect(exists).to.equal(true);
      expect(ts).to.be.gt(0n);
    });

    it("returnează false pentru vot inexistent", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      const [exists] = await contract.verifyVote(fakeHash);
      expect(exists).to.equal(false);
    });
  });

  // ─── ÎNCHIDERE ALEGERE ────────────────────────────────────────────────────

  describe("closeElection", function () {
    beforeEach(async function () {
      await contract.createElection(electionId, "Alegeri Test", startTime, endTime);
    });

    it("owner poate închide alegerea", async function () {
      await expect(contract.closeElection(electionId))
        .to.emit(contract, "ElectionClosed")
        .withArgs(electionId, 0n);

      const e = await contract.elections(electionId);
      expect(e.active).to.equal(false);
    });

    it("nu se poate vota după închidere", async function () {
      await contract.closeElection(electionId);
      await expect(
        contract.castVote(electionId, voteHash1, voterToken1)
      ).to.be.revertedWith("VotSecure: election not active");
    });
  });

  // ─── STATISTICI ───────────────────────────────────────────────────────────

  describe("statistici", function () {
    it("returnează numărul corect de alegeri și voturi", async function () {
      await contract.createElection(electionId, "E1", startTime, endTime);
      await contract.castVote(electionId, voteHash1, voterToken1);
      await contract.castVote(electionId, voteHash2, voterToken2);

      expect(await contract.getElectionCount()).to.equal(1n);
      expect(await contract.getTotalVotes()).to.equal(2n);
    });
  });
});
