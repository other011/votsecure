require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../config/.env" });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Rețea locală pentru dezvoltare și testare
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Rețea de test Sepolia (Ethereum testnet)
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 11155111,
    },
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};
