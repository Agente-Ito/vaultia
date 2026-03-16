import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const LUKSO_TESTNET_RPC = process.env.LUKSO_TESTNET_RPC ?? "https://rpc.testnet.lukso.network";
const LUKSO_MAINNET_RPC = process.env.LUKSO_MAINNET_RPC ?? "https://rpc.mainnet.lukso.network";

// Parse PRIVATE_KEY - can be single key or comma-separated list
const getPrivateKeys = (): string[] => {
  if (!process.env.PRIVATE_KEY) return [];
  const keys = process.env.PRIVATE_KEY.split(",").map((k) => k.trim()).filter(Boolean);
  const valid = keys.filter((k) => {
    const normalized = k.startsWith("0x") ? k.slice(2) : k;
    return normalized.length === 64;
  });
  if (valid.length !== keys.length) {
    console.warn(
      `⚠️  WARNING: Found ${keys.length} PRIVATE_KEY entries, but only ${valid.length} are valid 64-char hex strings.`
    );
  }
  return valid;
};

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Optimized for contract usage, not deployment
      },
    },
  },
  networks: {
    // LUKSO Testnet (chainId: 4201)
    luksoTestnet: {
      url: LUKSO_TESTNET_RPC,
      chainId: 4201,
      accounts: getPrivateKeys(),
      gasPrice: "auto",
      timeout: 60000,
    },

    // LUKSO Mainnet (chainId: 42)
    luksoMainnet: {
      url: LUKSO_MAINNET_RPC,
      chainId: 42,
      accounts: getPrivateKeys(),
      gasPrice: "auto",
      timeout: 60000,
    },

    // Local Hardhat network for testing
    hardhat: {
      chainId: 31337,
      allowUnlimitedContractSize: true,
      loggingEnabled: process.env.HARDHAT_LOGGING === "true",
    },
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  // Gas reporter — enabled by default; set DISABLE_GAS_REPORT=true to suppress output
  gasReporter: {
    enabled: process.env.DISABLE_GAS_REPORT !== "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    noColors: process.env.CI === "true",
  },

  // Contract verification
  etherscan: {
    apiKey: {
      luksoTestnet: process.env.ETHERSCAN_API_KEY ?? "",
      luksoMainnet: process.env.ETHERSCAN_API_KEY ?? "",
    },
    customChains: [
      {
        network: "luksoTestnet",
        chainId: 4201,
        urls: {
          apiURL: "https://api.testnet.lukso.network/api",
          browserURL: "https://explorer.testnet.lukso.network",
        },
      },
      {
        network: "luksoMainnet",
        chainId: 42,
        urls: {
          apiURL: "https://api.mainnet.lukso.network/api",
          browserURL: "https://explorer.mainnet.lukso.network",
        },
      },
    ],
  },

  // TypeChain configuration for type-safe contract interactions
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
