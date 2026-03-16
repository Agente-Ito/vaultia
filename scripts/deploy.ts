import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentResult {
  network: string;
  chainId: number;
  deployer: string;
  registryAddress: string;
  merchantRegistryAddress: string;
  agentSafeAddress: string;
  keyManagerAddress: string;
  policyEngineAddress: string;
  agentPrivateKey: string;
  agentAddress: string;
  safeBalance: string;
  deploymentTimestamp: number;
  blockNumber: number;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log("🔗 Network:", network.name, `(chainId: ${network.chainId})`);

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("📍 Deployer:", deployer.address);
  console.log("💰 Balance:", ethers.formatEther(balance), "LYX");

  if (ethers.formatEther(balance) === "0.0") {
    throw new Error("❌ Deployer balance is 0. Please fund your account on LUKSO testnet.");
  }

  // 1. Deploy MerchantRegistry
  console.log("\n📦 Deploying MerchantRegistry...");
  const MerchantRegistryFactory = await ethers.getContractFactory("MerchantRegistry");
  const merchantRegistry = await MerchantRegistryFactory.deploy();
  const merchantRegistryAddr = await merchantRegistry.getAddress();
  await merchantRegistry.waitForDeployment();
  console.log("✅ MerchantRegistry:", merchantRegistryAddr);

  // 2. Deploy AgentVaultRegistry
  console.log("\n📦 Deploying AgentVaultRegistry...");
  const AgentVaultRegistryFactory = await ethers.getContractFactory("AgentVaultRegistry");
  const registry = await AgentVaultRegistryFactory.deploy();
  const registryAddr = await registry.getAddress();
  await registry.waitForDeployment();
  console.log("✅ AgentVaultRegistry:", registryAddr);

  // 3. Deploy demo vault
  console.log("\n📦 Deploying demo vault...");
  const agentWallet = ethers.Wallet.createRandom();
  console.log("🤖 Demo agent address:", agentWallet.address);

  const ONE_WEEK_FROM_NOW = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  const deployParams = {
    budget: ethers.parseEther("100"),   // 100 LYX per week
    period: 1,                           // WEEKLY (0=daily, 1=weekly, 2=monthly, 3=yearly)
    budgetToken: ethers.ZeroAddress,     // LYX budget
    expiration: ONE_WEEK_FROM_NOW,       // expires in 7 days
    agents: [agentWallet.address],
    merchants: [deployer.address],       // deployer as demo merchant
    label: "Demo Vault – Weekly Budget",
  };

  const estimatedGas = await registry.deployVault.estimateGas(deployParams);
  console.log("⚡ Estimated gas:", estimatedGas.toString());

  const tx = await registry.deployVault(deployParams);
  console.log("📝 Transaction hash:", tx.hash);

  const receipt = await tx.wait();
  if (!receipt) throw new Error("Transaction failed");

  console.log("✅ Vault deployed in block:", receipt.blockNumber);

  // Extract vault from event
  const event = receipt.logs
    .map((log) => {
      try {
        return registry.interface.parseLog(log as any);
      } catch {
        return null;
      }
    })
    .find((e) => e?.name === "VaultDeployed");

  if (!event) throw new Error("VaultDeployed event not found");

  const safeAddr = event.args.safe;
  const kmAddr = event.args.keyManager;
  const peAddr = event.args.policyEngine;

  console.log("\n🏛️  Vault Stack:");
  console.log("  AgentSafe:      ", safeAddr);
  console.log("  LSP6KeyManager: ", kmAddr);
  console.log("  PolicyEngine:   ", peAddr);

  // 4. Accept ownership (LSP14 two-step)
  console.log("\n🔐 Accepting ownership...");
  const safe = await ethers.getContractAt("AgentSafe", safeAddr);

  try {
    const acceptTx = await safe.acceptOwnership();
    await acceptTx.wait();
    console.log("✅ Ownership accepted on AgentSafe");
  } catch (err: any) {
    console.error("⚠️  AgentSafe acceptOwnership failed:", err.message);
    throw err;
  }

  const pe = await ethers.getContractAt("PolicyEngine", peAddr);
  try {
    const acceptPeTx = await pe.acceptOwnership();
    await acceptPeTx.wait();
    console.log("✅ Ownership accepted on PolicyEngine");
  } catch (err: any) {
    console.error("⚠️  PolicyEngine acceptOwnership failed:", err.message);
    throw err;
  }

  // Also accept BudgetPolicy (deployed by registry)
  const budgetPolicies = await pe.getPolicies();
  if (budgetPolicies.length > 0) {
    const budgetPolicy = await ethers.getContractAt("BudgetPolicy", budgetPolicies[0]);
    try {
      const acceptBpTx = await budgetPolicy.acceptOwnership();
      await acceptBpTx.wait();
      console.log("✅ Ownership accepted on BudgetPolicy");
    } catch (err) {
      console.warn("⚠️  BudgetPolicy acceptOwnership skipped (may not be needed)");
    }
  }

  // 5. Fund the safe
  console.log("\n💸 Funding vault with 50 LYX...");
  const fundTx = await deployer.sendTransaction({
    to: safeAddr,
    value: ethers.parseEther("50"),
  });
  await fundTx.wait();
  const safeBalance = await ethers.provider.getBalance(safeAddr);
  console.log("✅ Safe balance:", ethers.formatEther(safeBalance), "LYX");

  // 6. Prepare deployment result
  const blockNumber = await ethers.provider.getBlockNumber();
  const result: DeploymentResult = {
    network: network.name,
    chainId: network.chainId,
    deployer: deployer.address,
    registryAddress: registryAddr,
    merchantRegistryAddress: merchantRegistryAddr,
    agentSafeAddress: safeAddr,
    keyManagerAddress: kmAddr,
    policyEngineAddress: peAddr,
    agentPrivateKey: agentWallet.privateKey,
    agentAddress: agentWallet.address,
    safeBalance: ethers.formatEther(safeBalance),
    deploymentTimestamp: Math.floor(Date.now() / 1000),
    blockNumber,
  };

  // 7. Save to .env
  console.log("\n💾 Updating .env file...");
  const envPath = path.join(__dirname, "..", ".env");
  let envContent = fs.readFileSync(envPath, "utf-8");

  // Update or add variables
  const updates = [
    { key: "REGISTRY_ADDRESS", value: result.registryAddress },
    { key: "MERCHANT_REGISTRY_ADDRESS", value: result.merchantRegistryAddress },
    { key: "AGENT_SAFE_ADDRESS", value: result.agentSafeAddress },
    { key: "KEY_MANAGER_ADDRESS", value: result.keyManagerAddress },
    { key: "POLICY_ENGINE_ADDRESS", value: result.policyEngineAddress },
    { key: "AGENT_PRIVATE_KEY", value: result.agentPrivateKey },
    { key: "AGENT_ADDRESS", value: result.agentAddress },
  ];

  updates.forEach(({ key, value }) => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  });

  fs.writeFileSync(envPath, envContent);
  console.log("✅ Variables saved to .env");

  // 8. Block explorer links
  console.log("\n🔍 Block Explorer Links (LUKSO Testnet):");
  console.log(`  Registry:       https://explorer.testnet.lukso.network/address/${registryAddr}`);
  console.log(`  Safe:           https://explorer.testnet.lukso.network/address/${safeAddr}`);
  console.log(`  KeyManager:     https://explorer.testnet.lukso.network/address/${kmAddr}`);
  console.log(`  PolicyEngine:   https://explorer.testnet.lukso.network/address/${peAddr}`);

  // 9. Summary
  console.log("\n========================================");
  console.log("✅ Deployment Successful!");
  console.log("========================================");
  console.log(JSON.stringify(result, null, 2));
  console.log("\n⚠️  IMPORTANT:");
  console.log("   • Agent wallet private key is printed above. Store it securely!");
  console.log("   • The vault is funded with 50 LYX for testing");
  console.log("   • Budget: 100 LYX per week (BudgetPolicy)");
  console.log("   • Merchant whitelist: deployer only");
  console.log("   • Expiration: 7 days from now");
}

main().catch((error) => {
  console.error("❌ Deployment failed:");
  console.error(error);
  process.exitCode = 1;
});
