import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import {
  AP_ARRAY_KEY,
  apArrayElementKey,
  apPermissionsKey,
  SUPER_PERM,
  PERM_STRICT_PAYMENTS,
  AgentMode,
  encodeAllowedCalls,
  verifyWrite,
  decodeHardhatError,
} from "./lsp6Keys";

interface DeploymentResult {
  network: string;
  chainId: number;
  deployer: string;
  registryAddress: string;
  merchantRegistryAddress: string;
  coordinatorAddress: string;
  sharedBudgetPoolAddress: string;
  taskSchedulerAddress: string;
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

  // Track nonce manually — querying RPC after each confirm can return stale data
  let nonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
  console.log(`   Starting nonce: ${nonce}`);

  // 1. Deploy MerchantRegistry
  console.log("\n[1/5] Deploying MerchantRegistry...");
  const MerchantRegistryFactory = await ethers.getContractFactory("MerchantRegistry");
  const merchantRegistry = await MerchantRegistryFactory.deploy({ nonce: nonce++ });
  const merchantRegistryAddr = await merchantRegistry.getAddress();
  await merchantRegistry.waitForDeployment();
  console.log("✅ MerchantRegistry:", merchantRegistryAddr);

  // 2. Deploy AgentVaultDeployerCore
  console.log("\n[2/5] Deploying AgentVaultDeployerCore...");
  const CoreFactory = await ethers.getContractFactory("AgentVaultDeployerCore");
  const vdCore = await CoreFactory.deploy({ nonce: nonce++ });
  await vdCore.waitForDeployment();
  const coreAddr = await vdCore.getAddress();
  console.log("✅ AgentVaultDeployerCore:", coreAddr);

  // 3. Deploy AgentVaultDeployer
  console.log("\n[3/5] Deploying AgentVaultDeployer...");
  const DeployerFactory = await ethers.getContractFactory("AgentVaultDeployer");
  const vd = await DeployerFactory.deploy({ nonce: nonce++ });
  await vd.waitForDeployment();
  const vdAddr = await vd.getAddress();
  console.log("✅ AgentVaultDeployer:", vdAddr);

  // 4. Deploy AgentKMDeployer
  console.log("\n[4/6] Deploying AgentKMDeployer...");
  const KMFactory = await ethers.getContractFactory("AgentKMDeployer");
  const km = await KMFactory.deploy({ nonce: nonce++ });
  await km.waitForDeployment();
  const kmDeployerAddr = await km.getAddress();
  console.log("✅ AgentKMDeployer:", kmDeployerAddr);

  // 5. Deploy TaskScheduler
  console.log("\n[5/6] Deploying TaskScheduler...");
  const TaskSchedulerFactory = await ethers.getContractFactory("TaskScheduler");
  const taskScheduler = await TaskSchedulerFactory.deploy({ nonce: nonce++ });
  await taskScheduler.waitForDeployment();
  const taskSchedulerAddr = await taskScheduler.getAddress();
  console.log("✅ TaskScheduler:", taskSchedulerAddr);

  // 6. Deploy AgentCoordinator
  console.log("\n[6/8] Deploying AgentCoordinator...");
  const AgentCoordinatorFactory = await ethers.getContractFactory("AgentCoordinator");
  const coordinator = await AgentCoordinatorFactory.deploy({ nonce: nonce++ });
  await coordinator.waitForDeployment();
  const coordinatorAddr = await coordinator.getAddress();
  console.log("✅ AgentCoordinator:", coordinatorAddr);

  // 7. Deploy SharedBudgetPool (authorizedPolicy set to deployer as placeholder;
  //    update via setAuthorizedPolicy() once a SharedBudgetPolicy is deployed)
  console.log("\n[7/8] Deploying SharedBudgetPool...");
  const SharedBudgetPoolFactory = await ethers.getContractFactory("SharedBudgetPool");
  const sharedBudgetPool = await SharedBudgetPoolFactory.deploy(deployer.address, { nonce: nonce++ });
  await sharedBudgetPool.waitForDeployment();
  const sharedBudgetPoolAddr = await sharedBudgetPool.getAddress();
  console.log("✅ SharedBudgetPool:", sharedBudgetPoolAddr);

  // 8. Deploy AgentVaultRegistry (now requires coordinator + pool)
  console.log("\n[8/8] Deploying AgentVaultRegistry...");
  const AgentVaultRegistryFactory = await ethers.getContractFactory("AgentVaultRegistry");
  const registry = await AgentVaultRegistryFactory.deploy(
    coreAddr, vdAddr, kmDeployerAddr, coordinatorAddr, sharedBudgetPoolAddr,
    { nonce: nonce++ }
  );
  const registryAddr = await registry.getAddress();
  await registry.waitForDeployment();
  console.log("✅ AgentVaultRegistry:", registryAddr);

  // Wire authorizations: registry is allowed to call registerAgent/assignRole
  // on coordinator and createPool on the budget pool during deployForAgent().
  console.log("\n🔑 Wiring protocol authorizations...");
  await coordinator.setAuthorizedCaller(registryAddr, true, { nonce: nonce++ });
  console.log("✅ Registry authorized in AgentCoordinator");
  await sharedBudgetPool.setAuthorizedDeployer(registryAddr, true, { nonce: nonce++ });
  console.log("✅ Registry authorized in SharedBudgetPool");

  // 3. Deploy demo vault
  console.log("\n📦 Deploying demo vault...");
  const agentWallet = ethers.Wallet.createRandom();
  console.log("🤖 Demo agent address:", agentWallet.address);

  console.log("\n🧾 Registering demo agent in AgentCoordinator...");
  const registerAgentTx = await coordinator.registerAgent(agentWallet.address, 0, true, { nonce: nonce++ });
  await registerAgentTx.wait();
  console.log("✅ Demo agent registered in AgentCoordinator");

  const ONE_WEEK_FROM_NOW = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  const deployParams = {
    budget: ethers.parseEther("100"),   // 100 LYX per week
    period: 1,                           // WEEKLY (0=daily, 1=weekly, 2=monthly, 3=yearly)
    budgetToken: ethers.ZeroAddress,     // LYX budget
    expiration: ONE_WEEK_FROM_NOW,       // expires in 7 days
    agents: [agentWallet.address],
    agentBudgets: [],                    // no per-agent budgets for demo
    merchants: [deployer.address],       // deployer as demo merchant
    label: "Demo Vault – Weekly Budget",
    // Permission profile — no SUPER_* bits; AllowedCalls enforced on-chain
    agentMode: AgentMode.STRICT_PAYMENTS,
    allowSuperPermissions: false,
    customAgentPermissions: ethers.ZeroHash,
    allowedCallsByAgent: [
      { agent: agentWallet.address, allowedCalls: encodeAllowedCalls([deployer.address]) },
    ],
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

  // 4. Post-deploy permission verification (read-back from ERC725Y storage)
  console.log("\n🔍 Verifying on-chain permission storage...");
  const safeERC725 = await ethers.getContractAt("AgentSafe", safeAddr);
  const ownerPermKey = apPermissionsKey(deployer.address);
  const agentPermKey = apPermissionsKey(agentWallet.address);
  // AP_ARRAY_KEY stores abi.encodePacked(uint128(count)) = 16 bytes (32 hex chars)
  const expectedArrayLength = "0x00000000000000000000000000000002"; // 1 owner + 1 agent
  try {
    await verifyWrite(safeERC725, AP_ARRAY_KEY, expectedArrayLength, "AddressPermissions[] length = 2");
    await verifyWrite(safeERC725, ownerPermKey, SUPER_PERM, "owner SUPER permissions");
    await verifyWrite(safeERC725, agentPermKey, PERM_STRICT_PAYMENTS, "agent STRICT_PAYMENTS permissions");
    console.log("✅ All permission writes verified on-chain");
  } catch (err: unknown) {
    console.error("❌ Permission verification failed:", decodeHardhatError(err));
    throw err;
  }

  // 5. Accept ownership on AgentSafe (LSP14 two-step — only Safe uses LSP14)
  //    PolicyEngine and BudgetPolicy use OZ Ownable (single-step), no acceptOwnership needed.
  console.log("\n🔐 Accepting ownership on AgentSafe (LSP14)...");
  const safe = await ethers.getContractAt("AgentSafe", safeAddr);

  try {
    const acceptTx = await safe.acceptOwnership();
    await acceptTx.wait();
    console.log("✅ Ownership accepted on AgentSafe");
  } catch (err: any) {
    console.error("⚠️  AgentSafe acceptOwnership failed:", err.message);
    throw err;
  }

  // 5. Fund the safe
  console.log("\n💸 Funding vault with 1 LYX...");
  const fundTx = await deployer.sendTransaction({
    to: safeAddr,
    value: ethers.parseEther("1"),
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
    coordinatorAddress: coordinatorAddr,
    sharedBudgetPoolAddress: sharedBudgetPoolAddr,
    taskSchedulerAddress: taskSchedulerAddr,
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
    { key: "COORDINATOR_ADDRESS", value: result.coordinatorAddress },
    { key: "TASK_SCHEDULER_ADDRESS", value: result.taskSchedulerAddress },
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

  // 7b. Save deployment JSON
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const jsonPath = path.join(deploymentsDir, `lukso-testnet-${network.chainId}.json`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)
  );
  console.log("✅ Deployment JSON saved to", jsonPath);

  // 8. Block explorer links
  console.log("\n🔍 Block Explorer Links (LUKSO Testnet):");
  console.log(`  DeployerCore:   https://explorer.testnet.lukso.network/address/${coreAddr}`);
  console.log(`  Deployer:       https://explorer.testnet.lukso.network/address/${vdAddr}`);
  console.log(`  KMDeployer:     https://explorer.testnet.lukso.network/address/${kmDeployerAddr}`);
  console.log(`  TaskScheduler:  https://explorer.testnet.lukso.network/address/${taskSchedulerAddr}`);
  console.log(`  Coordinator:    https://explorer.testnet.lukso.network/address/${coordinatorAddr}`);
  console.log(`  Registry:       https://explorer.testnet.lukso.network/address/${registryAddr}`);
  console.log(`  Safe:           https://explorer.testnet.lukso.network/address/${safeAddr}`);
  console.log(`  KeyManager:     https://explorer.testnet.lukso.network/address/${kmAddr}`);
  console.log(`  PolicyEngine:   https://explorer.testnet.lukso.network/address/${peAddr}`);

  // 9. Summary
  console.log("\n========================================");
  console.log("✅ Deployment Successful!");
  console.log("========================================");
  console.log(JSON.stringify(result, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
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
