import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { AgentMode, decodeHardhatError, encodeAllowedCalls } from "./lsp6Keys";

dotenv.config();

function getEnvAddress(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (!ethers.isAddress(value)) {
    throw new Error(`Invalid address in ${name}: ${value}`);
  }
  return value;
}

async function main() {
  const mode = (process.env.DEBUG_DEPLOY_MODE ?? "native").trim().toLowerCase();
  const shouldBroadcast = process.env.DEBUG_DEPLOY_BROADCAST === "true";
  const registryAddress = process.env.REGISTRY_ADDRESS;

  if (!registryAddress) {
    throw new Error("Missing REGISTRY_ADDRESS in .env");
  }

  const [operator] = await ethers.getSigners();
  const registry = await ethers.getContractAt("AgentVaultRegistry", registryAddress);
  const merchant = getEnvAddress("LIVE_STRESS_MERCHANT", operator.address);
  const limitedRecipient = getEnvAddress(
    "LIVE_STRESS_LIMITED_RECIPIENT",
    "0x1000000000000000000000000000000000000001",
  );
  const outsider = getEnvAddress(
    "LIVE_STRESS_OUTSIDER",
    "0x2000000000000000000000000000000000000002",
  );

  let budgetToken = ethers.ZeroAddress;
  let labelPrefix = "Debug Native Vault";
  let allowedTargets = [merchant, limitedRecipient, outsider];

  if (mode === "lsp7") {
    const tokenAddress = process.env.LIVE_STRESS_LSP7_TOKEN?.trim() || process.env.DEMO_TOKEN_ADDRESS?.trim();
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      throw new Error("Set LIVE_STRESS_LSP7_TOKEN or DEMO_TOKEN_ADDRESS to a valid token address for lsp7 mode.");
    }
    budgetToken = tokenAddress;
    labelPrefix = "Debug LSP7 Vault";
    allowedTargets = [tokenAddress, merchant, limitedRecipient, outsider];
  }

  const params = {
    budget: ethers.parseEther("1"),
    period: 1,
    budgetToken,
    expiration: 0,
    agents: [operator.address],
    agentBudgets: [],
    merchants: [merchant, limitedRecipient],
    recipientConfigs: [
      { recipient: merchant, budget: 0n, period: 1 },
      { recipient: limitedRecipient, budget: ethers.parseEther("0.3"), period: 1 },
    ],
    label: `${labelPrefix} ${Date.now()}`,
    agentMode: AgentMode.STRICT_PAYMENTS,
    allowSuperPermissions: false,
    customAgentPermissions: ethers.ZeroHash,
    allowedCallsByAgent: [{
      agent: operator.address,
      allowedCalls: encodeAllowedCalls(allowedTargets),
    }],
  };

  console.log("Debug deploy mode:", mode);
  console.log("Operator:", operator.address);
  console.log("Registry:", registryAddress);
  console.log("Budget token:", budgetToken);
  console.log("Broadcast tx:", shouldBroadcast);
  console.log("Label:", params.label);

  console.log("\n[1/3] staticCall deployVault...");
  try {
    const result = await (registry.deployVault.staticCall as any)(params);
    console.log("staticCall: ok");
    console.log(result);
  } catch (error) {
    console.log("staticCall: failed");
    console.log(decodeHardhatError(error));
  }

  console.log("\n[2/3] estimateGas deployVault...");
  try {
    const gas = await registry.deployVault.estimateGas(params);
    console.log("estimateGas: ok");
    console.log(gas.toString());
  } catch (error) {
    console.log("estimateGas: failed");
    console.log(decodeHardhatError(error));
    return;
  }

  if (!shouldBroadcast) {
    console.log("\n[3/3] broadcast skipped (set DEBUG_DEPLOY_BROADCAST=true to send tx)");
    return;
  }

  console.log("\n[3/3] broadcast deployVault...");
  try {
    const tx = await registry.deployVault(params);
    console.log("tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("receipt block:", receipt?.blockNumber ?? "?");

    const deployedEvent = receipt?.logs
      .map((log) => {
        try {
          return registry.interface.parseLog(log as any);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "VaultDeployed");

    if (!deployedEvent) {
      console.log("VaultDeployed event not found in receipt");
      return;
    }

    const safeAddress = deployedEvent.args.safe as string;
    const keyManagerAddress = deployedEvent.args.keyManager as string;
    const policyEngineAddress = deployedEvent.args.policyEngine as string;
    console.log("safe:", safeAddress);
    console.log("keyManager:", keyManagerAddress);
    console.log("policyEngine:", policyEngineAddress);

    const safe = await ethers.getContractAt("AgentSafe", safeAddress) as any;
    const policyEngine = await ethers.getContractAt("PolicyEngine", policyEngineAddress) as any;
    const policies = await policyEngine.getPolicies();

    console.log("\npost-deploy ownership state:");
    console.log("safe owner:", await safe.owner());
    console.log("safe pendingOwner:", await safe.pendingOwner());
    console.log("policyEngine owner:", await policyEngine.owner());
    try {
      console.log("policyEngine pendingOwner:", await policyEngine.pendingOwner());
    } catch {
      console.log("policyEngine pendingOwner: unavailable");
    }
    console.log("policies:", policies.length);
    for (let index = 0; index < policies.length; index++) {
      const policy = await ethers.getContractAt("BudgetPolicy", policies[index]) as any;
      console.log(`policy[${index}] address:`, policies[index]);
      console.log(`policy[${index}] owner:`, await policy.owner());
      try {
        console.log(`policy[${index}] pendingOwner:`, await policy.pendingOwner());
      } catch {
        console.log(`policy[${index}] pendingOwner: unavailable`);
      }
    }
  } catch (error) {
    console.log("broadcast: failed");
    console.log(decodeHardhatError(error));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});