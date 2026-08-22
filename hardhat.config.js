require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// BOT Chain Mainnet: chain ID 677 (0x2a5), native token BOT.
// Confirm the RPC endpoint against https://dev-docs.botchain.ai before deploying.
const BOTCHAIN_RPC = process.env.BOTCHAIN_RPC_URL || "https://rpc.botchain.ai";
// BOT Chain Testnet ("Bohr"), chain ID 968. Everything is rehearsed here first so a
// deployment mistake costs tBOT rather than the 1 BOT mainnet grant.
const BOHR_RPC = process.env.BOHR_RPC_URL || "https://rpc.bohr.life";

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Paris until BOT Chain's fork level is confirmed. Cancun opcodes (mcopy,
      // tstore) and even PUSH0 are not safe assumptions on a young chain.
      evmVersion: "paris",
    },
  },
  networks: {
    botchain: {
      url: BOTCHAIN_RPC,
      chainId: 677,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
    bohr: {
      url: BOHR_RPC,
      chainId: 968,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
  },
  etherscan: {
    apiKey: { botchain: "no-key-required" },
    customChains: [
      {
        network: "botchain",
        chainId: 677,
        urls: {
          apiURL: "https://scan.botchain.ai/api",
          browserURL: "https://scan.botchain.ai",
        },
      },
      {
        network: "bohr",
        chainId: 968,
        urls: {
          apiURL: "https://scan.bohr.life/api",
          browserURL: "https://scan.bohr.life",
        },
      },
    ],
  },
};
