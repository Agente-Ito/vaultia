import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Demo payment script - shows how an agent makes a payment through the vault
 *
 * Usage:
 *   MERCHANT_ADDRESS=0x... PAYMENT_AMOUNT=10 npx hardhat run scripts/demoPayment.ts --network luksoTestnet
 */

async function main() {
  // ============ Setup ============
  const merchantAddr = process.env.MERCHANT_ADDRESS;
  const paymentStr = process.env.PAYMENT_AMOUNT ?? "1"; // Default 1 LYX

  if (!merchantAddr) throw new Error("❌ MERCHANT_ADDRESS not set in .env");
  if (!merchantAddr.match(/^0x[a-fA-F0-9]{40}$/)) throw new Error("❌ MERCHANT_ADDRESS invalid");

  const paymentAmount = ethers.parseEther(paymentStr);
  console.log("💳 Demo Payment");
  console.log("===============");
  console.log("Merchant:   ", merchantAddr);
  console.log("Amount:     ", ethers.formatEther(paymentAmount), "LYX");

  // Load addresses from .env
  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
  const agentAddr = process.env.AGENT_ADDRESS;
  const safeAddr = process.env.AGENT_SAFE_ADDRESS;
  const kmAddr = process.env.KEY_MANAGER_ADDRESS;
  const peAddr = process.env.POLICY_ENGINE_ADDRESS;

  if (!agentPrivateKey || !agentAddr || !safeAddr || !kmAddr || !peAddr) {
    throw new Error("❌ Missing deployment addresses. Run deploy.ts first.");
  }

  console.log("\nConnecting...");
  console.log("Agent:           ", agentAddr);
  console.log("Safe:            ", safeAddr);
  console.log("KeyManager:      ", kmAddr);
  console.log("PolicyEngine:    ", peAddr);

  // ============ Contract Setup ============
  const agentWallet = new ethers.Wallet(agentPrivateKey);
  const agent = agentWallet.connect(ethers.provider);

  const safe = await ethers.getContractAt("AgentSafe", safeAddr);
  const km = await ethers.getContractAt("LSP6KeyManager", kmAddr);
  const pe = await ethers.getContractAt("PolicyEngine", peAddr);

  // Verify connections
  console.log("\n📡 Verifying contracts...");
  try {
    const owner = await safe.owner();
    console.log("✅ AgentSafe connected (owner:", owner, ")");
  } catch (e) {
    throw new Error("❌ Cannot connect to AgentSafe");
  }

  try {
    const linkedSafe = await km.target;
    console.log("✅ KeyManager connected");
  } catch (e) {
    throw new Error("❌ Cannot connect to KeyManager");
  }

  // ============ Check Balances ============
  console.log("\n💰 Balances:");
  const safeBalance = await ethers.provider.getBalance(safeAddr);
  const agentBalance = await ethers.provider.getBalance(agentAddr);
  console.log("Safe balance:    ", ethers.formatEther(safeBalance), "LYX");
  console.log("Agent balance:   ", ethers.formatEther(agentBalance), "LYX");

  if (safeBalance < paymentAmount) {
    throw new Error(`❌ Safe balance insufficient. Need ${ethers.formatEther(paymentAmount)}, have ${ethers.formatEther(safeBalance)}`);
  }

  // ============ Check Policies ============
  console.log("\n📋 Checking policies...");
  const policies = await pe.getPolicies();
  console.log("Active policies: ", policies.length);

  if (policies.length === 0) {
    throw new Error("❌ No policies registered on PolicyEngine");
  }

  // Check BudgetPolicy (first one should be it)
  const budgetPolicyAddr = policies[0];
  const budgetPolicy = await ethers.getContractAt("BudgetPolicy", budgetPolicyAddr);
  const spent = await budgetPolicy.spent();
  const budget = await budgetPolicy.budget();
  const remaining = budget - spent;

  console.log("BudgetPolicy:");
  console.log("  Budget:        ", ethers.formatEther(budget), "LYX");
  console.log("  Already spent: ", ethers.formatEther(spent), "LYX");
  console.log("  Remaining:     ", ethers.formatEther(remaining), "LYX");

  if (remaining < paymentAmount) {
    throw new Error(`❌ Budget exceeded. Remaining: ${ethers.formatEther(remaining)}, requested: ${ethers.formatEther(paymentAmount)}`);
  }

  // ============ Prepare Payment ============
  console.log("\n🔧 Preparing transaction...");

  // Agent calls: km.execute(abi.encodeCall(IERC725X.execute, (0, target, value, "")))
  // Where execute() is the payment function on AgentSafe
  const callData = safe.interface.encodeFunctionData("agentExecute", [merchantAddr, paymentAmount, "0x"]);

  console.log("Encoded calldata:", callData);
  const estimatedGas = await km.execute.estimateGas(0, safeAddr, 0, callData, { from: agentAddr });
  console.log("⚡ Estimated gas: ", estimatedGas.toString());

  // ============ Execute Payment ============
  console.log("\n⏳ Executing payment...");
  const tx = await km.connect(agent).execute(0, safeAddr, 0, callData);
  console.log("📝 TX hash:", tx.hash);

  const receipt = await tx.wait();
  if (!receipt) throw new Error("Transaction failed");

  console.log("✅ Payment confirmed in block:", receipt.blockNumber);

  // ============ Verify Payment ============
  console.log("\n🎉 Verifying payment...");
  const newSpent = await budgetPolicy.spent();
  const newRemaining = budget - newSpent;

  console.log("Updated BudgetPolicy:");
  console.log("  Already spent: ", ethers.formatEther(newSpent), "LYX");
  console.log("  Remaining:     ", ethers.formatEther(newRemaining), "LYX");

  if (newSpent <= spent) {
    throw new Error("⚠️  Budget not updated. Something may be wrong.");
  }

  console.log("\n✅ Payment Successful!");
  console.log("🔍 View on block explorer:");
  console.log(`   https://explorer.testnet.lukso.network/tx/${tx.hash}`);
}

main().catch((error) => {
  console.error("\n❌ Error:", error.message);
  if (error.data) {
    console.error("Error data:", error.data);
  }
  process.exitCode = 1;
});
