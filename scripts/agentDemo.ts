/**
 * agentDemo.ts — Simulates an AI agent making periodic payments through the vault.
 *
 * Usage:
 *   npx hardhat run scripts/agentDemo.ts --network luksoTestnet
 *
 * Required .env:
 *   KEY_MANAGER_ADDRESS=0x...
 *   AGENT_PRIVATE_KEY=0x...
 *   MERCHANT_ADDRESS=0x...      (payment destination)
 *   PAYMENT_AMOUNT=1.5          (in LYX, optional — defaults to 0.1)
 */

import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const provider = ethers.provider;

  // Load agent key from env
  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
  if (!agentPrivateKey) throw new Error("AGENT_PRIVATE_KEY not set in .env");
  const agent = new ethers.Wallet(agentPrivateKey, provider);

  const kmAddress = process.env.KEY_MANAGER_ADDRESS;
  if (!kmAddress) throw new Error("KEY_MANAGER_ADDRESS not set in .env");

  const merchantAddress = process.env.MERCHANT_ADDRESS;
  if (!merchantAddress) throw new Error("MERCHANT_ADDRESS not set in .env");

  const paymentAmount = ethers.parseEther(process.env.PAYMENT_AMOUNT ?? "0.1");

  console.log("=== Agent Vault Demo ===");
  console.log("Agent:    ", agent.address);
  console.log("KM:       ", kmAddress);
  console.log("Merchant: ", merchantAddress);
  console.log("Amount:   ", ethers.formatEther(paymentAmount), "LYX");

  // Connect to LSP6 KeyManager
  const km = await ethers.getContractAt("LSP6KeyManager", kmAddress, agent);

  // Get the target safe address from env or fallback to LSP6KeyManager.target()
  const safeAddress =
    process.env.AGENT_SAFE_ADDRESS ||
    (await (async () => {
      try {
        return await km.target();
      } catch (err) {
        throw new Error(
          "AGENT_SAFE_ADDRESS is not set and LSP6KeyManager.target() failed. Please set AGENT_SAFE_ADDRESS in .env."
        );
      }
    })());

  const safe = await ethers.getContractAt("AgentSafe", safeAddress);

  console.log("\nSafe:     ", safeAddress);
  console.log("Safe LYX: ", ethers.formatEther(await provider.getBalance(safeAddress)), "LYX");

  // Read current budget state
  const peAddress = await safe.policyEngine();
  const pe = await ethers.getContractAt("PolicyEngine", peAddress);
  const policies = await pe.getPolicies();
  console.log("Policies: ", policies.length);

  // Encode the ERC725X.execute call (standard LUKSO agent call pattern):
  //   km.execute(abi.encodeCall(IERC725X.execute, (0, merchant, amount, "")))
  //   → safe.execute(0, merchant, amount, "")
  //   → AgentSafe.execute override validates policies → _execute()
  const safeInterface = safe.interface;
  const executeCalldata = safeInterface.encodeFunctionData("execute", [
    0,                // CALL operation type
    merchantAddress,  // payment destination
    paymentAmount,    // LYX amount in wei
    "0x",             // empty calldata (pure LYX transfer)
  ]);

  console.log("\nSending payment...");

  try {
    const tx = await km.execute(executeCalldata);
    const receipt = await tx.wait();
    console.log("✓ Payment sent! Tx:", receipt!.hash);
    console.log("  Gas used:", receipt!.gasUsed.toString());

    // Read updated budget
    if (policies.length > 0) {
      const budgetPolicy = await ethers.getContractAt("BudgetPolicy", policies[0]);
      const spent = await budgetPolicy.spent();
      const budget = await budgetPolicy.budget();
      console.log(
        `  Budget: ${ethers.formatEther(spent)} / ${ethers.formatEther(budget)} LYX spent this period`
      );
    }

    console.log("\nSafe LYX after:", ethers.formatEther(await provider.getBalance(safeAddress)), "LYX");
  } catch (err: any) {
    console.error("✗ Payment failed:", err.message);
    if (err.data) {
      try {
        const decoded = safe.interface.parseError(err.data);
        if (decoded) console.error("  Revert reason:", decoded.name, decoded.args);
      } catch {
        console.error("  Raw error data:", err.data);
      }
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
