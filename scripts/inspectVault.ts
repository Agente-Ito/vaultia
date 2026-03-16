import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Vault Inspector - Check the status of a deployed vault
 *
 * Usage:
 *   npx hardhat run scripts/inspectVault.ts --network luksoTestnet
 */

async function main() {
  console.log("🔍 Agent Vault Inspector");
  console.log("========================\n");

  // Load addresses from .env
  const safeAddr = process.env.AGENT_SAFE_ADDRESS;
  const kmAddr = process.env.KEY_MANAGER_ADDRESS;
  const peAddr = process.env.POLICY_ENGINE_ADDRESS;
  const registryAddr = process.env.REGISTRY_ADDRESS;
  const agentAddr = process.env.AGENT_ADDRESS;

  if (!safeAddr || !kmAddr || !peAddr || !registryAddr) {
    throw new Error("❌ Missing addresses in .env. Run deploy.ts first.");
  }

  // Get network info
  const network = await ethers.provider.getNetwork();
  const blockNumber = await ethers.provider.getBlockNumber();
  const blockTs = (await ethers.provider.getBlock(blockNumber))?.timestamp ?? 0;

  console.log("📡 Network Information:");
  console.log("  Network:       ", network.name, `(chainId: ${network.chainId})`);
  console.log("  Block number:  ", blockNumber);
  console.log("  Block time:    ", new Date(blockTs * 1000).toISOString());

  // ============ AgentSafe ============
  console.log("\n🏛️  AgentSafe");
  console.log("─".repeat(60));
  const safe = await ethers.getContractAt("AgentSafe", safeAddr);

  const owner = await safe.owner();
  const pendingOwner = await safe.pendingOwner();
  const balance = await ethers.provider.getBalance(safeAddr);
  const keyManager = await safe.vaultKeyManager();
  const policyEngine = await safe.policyEngine();

  console.log("Address:        ", safeAddr);
  console.log("Balance:        ", ethers.formatEther(balance), "LYX");
  console.log("Owner:          ", owner);
  if (pendingOwner !== ethers.ZeroAddress) {
    console.log("Pending owner:  ", pendingOwner);
  }
  console.log("KeyManager:     ", keyManager);
  console.log("PolicyEngine:   ", policyEngine);

  // ============ PolicyEngine ============
  console.log("\n⚙️  PolicyEngine");
  console.log("─".repeat(60));
  const pe = await ethers.getContractAt("PolicyEngine", peAddr);

  const peOwner = await pe.owner();
  const pePendingOwner = await pe.pendingOwner();
  const policies = await pe.getPolicies();

  console.log("Address:        ", peAddr);
  console.log("Owner:          ", peOwner);
  if (pePendingOwner !== ethers.ZeroAddress) {
    console.log("Pending owner:  ", pePendingOwner);
  }
  console.log("Total policies: ", policies.length);

  // ============ Policies ============
  console.log("\n📋 Policies:");
  console.log("─".repeat(60));

  for (let i = 0; i < policies.length; i++) {
    const policyAddr = policies[i];
    console.log(`\n[Policy ${i}] ${policyAddr}`);

    try {
      // Try to identify policy type
      const code = await ethers.provider.getCode(policyAddr);
      const bytecode = code.slice(2); // Remove 0x

      if (bytecode.includes("425564676574506f6c696379")) {
        // "BudgetPolicy" in hex
        console.log("  Type:          BudgetPolicy");
        const bp = await ethers.getContractAt("BudgetPolicy", policyAddr);
        const budget = await bp.budget();
        const period = await bp.period();
        const token = await bp.budgetToken();
        console.log("  Budget:        ", ethers.formatEther(budget), token === ethers.ZeroAddress ? "LYX" : "LSP7");
        console.log("  Period:        ", ["Daily", "Weekly", "Monthly", "Yearly"][period] || period.toString());

        if (agentAddr) {
          const spent = await bp.spent(agentAddr);
          console.log("  Agent spent:   ", ethers.formatEther(spent), "LYX");
        }
      } else if (bytecode.includes("4d657263686e74506f6c696379")) {
        // "MerchantPolicy" in hex
        console.log("  Type:          MerchantPolicy");
        const mp = await ethers.getContractAt("MerchantPolicy", policyAddr);
        const count = await mp.getMerchantsCount();
        console.log("  Merchants:     ", count.toString());
      } else if (bytecode.includes("457870697261")) {
        // "Expira" in hex
        console.log("  Type:          ExpirationPolicy");
        const ep = await ethers.getContractAt("ExpirationPolicy", policyAddr);
        const expiration = await ep.expiration();
        const expired = expiration <= blockTs;
        console.log("  Expires at:    ", new Date(expiration * 1000).toISOString());
        console.log("  Status:        ", expired ? "❌ EXPIRED" : "✅ Active");
      } else {
        console.log("  Type:          Unknown");
      }
    } catch (e) {
      console.log("  Type:          Unknown (error reading)");
      console.log("  Error:         ", (e as Error).message);
    }
  }

  // ============ LSP6KeyManager ============
  console.log("\n\n🔐 LSP6KeyManager");
  console.log("─".repeat(60));
  const km = await ethers.getContractAt("LSP6KeyManager", kmAddr);

  const kmTarget = await km.target;
  console.log("Address:        ", kmAddr);
  console.log("Target:         ", kmTarget);

  // ============ AgentVaultRegistry ============
  console.log("\n📦 AgentVaultRegistry");
  console.log("─".repeat(60));
  const registry = await ethers.getContractAt("AgentVaultRegistry", registryAddr);

  const registeredSafe = await registry.getKeyManager(safeAddr);
  const registeredPe = await registry.getPolicyEngine(safeAddr);

  console.log("Address:        ", registryAddr);
  console.log("Safe KM:        ", registeredSafe);
  console.log("Safe PE:        ", registeredPe);

  // ============ Summary ============
  console.log("\n\n✅ Vault Status Summary");
  console.log("=".repeat(60));

  const checks = [
    ["Safe funded", balance > ethers.parseEther("0.1") ? "✅" : "⚠️"],
    ["Owner set", owner !== ethers.ZeroAddress && owner !== (await ethers.provider.getSigner(0)).address ? "✅" : "⚠️"],
    ["KeyManager linked", keyManager === kmAddr ? "✅" : "❌"],
    ["PolicyEngine linked", policyEngine === peAddr ? "✅" : "❌"],
    ["Policies registered", policies.length > 0 ? "✅" : "❌"],
    ["No pending owners", pendingOwner === ethers.ZeroAddress && pePendingOwner === ethers.ZeroAddress ? "✅" : "⚠️"],
  ];

  checks.forEach(([name, status]) => {
    console.log(`${status} ${name}`);
  });

  console.log("\n🔍 Block Explorer:");
  console.log(`   Safe:       https://explorer.testnet.lukso.network/address/${safeAddr}`);
  console.log(`   KeyManager: https://explorer.testnet.lukso.network/address/${kmAddr}`);
  console.log(`   PolicyEngine: https://explorer.testnet.lukso.network/address/${peAddr}`);
}

main().catch((error) => {
  console.error("\n❌ Error:", error.message);
  process.exitCode = 1;
});
