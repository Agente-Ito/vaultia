/**
 * deployBase.ts
 * Deploys the Phase A Base contracts: BaseVaultFactory (which internally deploys
 * PolicyEngine, BudgetPolicy/MultiTokenBudgetPolicy, MerchantPolicy,
 * ExpirationPolicy, AgentBudgetPolicy, and BaseAgentVault per vault).
 *
 * Usage:
 *   npx hardhat run scripts/deployBase.ts --network baseMainnet
 *   npx hardhat run scripts/deployBase.ts --network baseSepolia
 *
 * Env vars required:
 *   PRIVATE_KEY          — deployer EOA private key
 *   BASE_MAINNET_RPC     — Base mainnet RPC URL (optional, has default)
 *   BASE_SEPOLIA_RPC     — Base Sepolia RPC URL (optional, has default)
 *   BASE_ETHERSCAN_KEY   — for contract verification
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── ERC-4337 EntryPoint addresses ────────────────────────────────────────────
const ENTRY_POINTS: Record<string, string> = {
  baseMainnet:  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // v0.6
  baseSepolia:  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // v0.6 (same address)
  hardhat:      "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // placeholder for local tests
};

// ─── Well-known token addresses (Base mainnet) ────────────────────────────────
export const BASE_TOKENS = {
  USDC:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  WETH:  "0x4200000000000000000000000000000000000006",
  cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  ETH:   ethers.ZeroAddress,
} as const;

async function main() {
  const network = (await ethers.provider.getNetwork()).name;
  console.log(`\n🔵 Deploying Base contracts to: ${network}`);

  const [deployer] = await ethers.getSigners();
  console.log(`   Deployer: ${deployer.address}`);
  console.log(`   Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  const entryPoint = ENTRY_POINTS[network] ?? ENTRY_POINTS.hardhat;
  console.log(`   EntryPoint (ERC-4337 v0.6): ${entryPoint}`);

  // ── Deploy deployer contracts ──────────────────────────────────────────────
  console.log("\n[1/3] Deploying BaseVaultDeployerCore…");
  const CoreF  = await ethers.getContractFactory("BaseVaultDeployerCore");
  const core   = await CoreF.deploy();
  await core.waitForDeployment();
  const coreAddr = await core.getAddress();
  console.log(`      ✅ BaseVaultDeployerCore: ${coreAddr}`);

  console.log("\n[2/3] Deploying BaseVaultDeployer…");
  const DeployerF  = await ethers.getContractFactory("BaseVaultDeployer");
  const deployerC  = await DeployerF.deploy();
  await deployerC.waitForDeployment();
  const deployerAddr = await deployerC.getAddress();
  console.log(`      ✅ BaseVaultDeployer: ${deployerAddr}`);

  // ── Deploy BaseVaultFactory ────────────────────────────────────────────────
  console.log("\n[3/3] Deploying BaseVaultFactory…");
  const FactoryF  = await ethers.getContractFactory("BaseVaultFactory");
  const factory   = await FactoryF.deploy(entryPoint, coreAddr, deployerAddr);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log(`      ✅ BaseVaultFactory: ${factoryAddr}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = {
    network,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    entryPoint,
    contracts: {
      BaseVaultDeployerCore: coreAddr,
      BaseVaultDeployer:     deployerAddr,
      BaseVaultFactory:      factoryAddr,
    },
    tokens: BASE_TOKENS,
    timestamp: new Date().toISOString(),
  };

  console.log("\n─────────────────────────────────────────────");
  console.log("Deployment summary:");
  console.log(JSON.stringify(summary, null, 2));

  // ── Persist deployment addresses ──────────────────────────────────────────
  const outDir  = path.join(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `base-${network}-${summary.chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  console.log(`\n📄 Deployment saved to: ${outFile}`);

  // ── Verification hint ─────────────────────────────────────────────────────
  console.log("\n📋 To verify on Basescan:");
  console.log(`   npx hardhat verify --network ${network} ${coreAddr}`);
  console.log(`   npx hardhat verify --network ${network} ${deployerAddr}`);
  console.log(`   npx hardhat verify --network ${network} ${factoryAddr} "${entryPoint}" "${coreAddr}" "${deployerAddr}"\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
