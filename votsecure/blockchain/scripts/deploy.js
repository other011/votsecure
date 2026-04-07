/**
 * scripts/deploy.js
 * Script de deploy pentru contractul VotSecure.
 * Rulare: npx hardhat run scripts/deploy.js --network localhost
 *         npx hardhat run scripts/deploy.js --network sepolia
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("═══════════════════════════════════════════");
  console.log("  VotSecure — Deploy Smart Contract");
  console.log("═══════════════════════════════════════════");
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Balance:   ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

  // Compilare și deploy
  const VotSecure = await ethers.getContractFactory("VotSecure");
  const contract  = await VotSecure.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\n✓ VotSecure deployed la: ${address}`);
  console.log(`  Network: ${(await ethers.provider.getNetwork()).name}`);

  // Salvează adresa în config pentru backend
  const deployInfo = {
    contractAddress: address,
    deployerAddress: deployer.address,
    network:         (await ethers.provider.getNetwork()).name,
    chainId:         (await ethers.provider.getNetwork()).chainId.toString(),
    deployedAt:      new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "../../config/contract-address.json");
  fs.writeFileSync(outPath, JSON.stringify(deployInfo, null, 2));
  console.log(`\n✓ Adresă salvată în: config/contract-address.json`);

  // Copiază ABI pentru backend
  const artifact  = require("../artifacts/contracts/VotSecure.sol/VotSecure.json");
  const abiOutPath = path.join(__dirname, "../../config/VotSecure.abi.json");
  fs.writeFileSync(abiOutPath, JSON.stringify(artifact.abi, null, 2));
  console.log(`✓ ABI salvat în:     config/VotSecure.abi.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
