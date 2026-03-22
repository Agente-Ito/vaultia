import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { AgentMode, encodeAllowedCalls } from "./lsp6Keys";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const WEEKLY = 1;
const VAULT_BUDGET = ethers.parseEther("3");
const RECIPIENT_LIMIT = ethers.parseEther("1");

function getEnvAddress(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (!ethers.isAddress(value)) {
    throw new Error(`Invalid address in ${name}: ${value}`);
  }
  return value;
}

async function expectStaticRevert(label: string, action: Promise<unknown>, expectedReason: string) {
  try {
    await action;
    throw new Error(`${label} unexpectedly succeeded`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedReason)) {
      throw new Error(`${label} reverted with unexpected reason: ${message}`);
    }
    console.log(`   Expected revert confirmed for ${label}: ${expectedReason}`);
  }
}

async function main() {
  const registryAddress = process.env.REGISTRY_ADDRESS;
  if (!registryAddress) {
    throw new Error("Missing REGISTRY_ADDRESS in .env");
  }

  const network = await ethers.provider.getNetwork();
  const [operator] = await ethers.getSigners();
  const merchant = getEnvAddress("LIVE_STRESS_MERCHANT", operator.address);
  const limitedRecipient = getEnvAddress(
    "LIVE_STRESS_LIMITED_RECIPIENT",
    "0x1000000000000000000000000000000000000001",
  );
  const outsider = getEnvAddress(
    "LIVE_STRESS_OUTSIDER",
    "0x2000000000000000000000000000000000000002",
  );

  const registry = await ethers.getContractAt("AgentVaultRegistry", registryAddress);

  console.log("Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("Operator:", operator.address);
  console.log("Registry:", registryAddress);
  console.log("Merchant:", merchant);
  console.log("Limited recipient:", limitedRecipient);
  console.log("Outsider:", outsider);

  const deployTx = await registry.connect(operator).deployVault({
    budget: VAULT_BUDGET,
    period: WEEKLY,
    budgetToken: ethers.ZeroAddress,
    expiration: 0,
    agents: [operator.address],
    agentBudgets: [],
    merchants: [merchant, limitedRecipient],
    recipientConfigs: [
      { recipient: merchant, budget: 0, period: WEEKLY },
      { recipient: limitedRecipient, budget: RECIPIENT_LIMIT, period: WEEKLY },
    ],
    label: `Live Stress Vault ${Date.now()}`,
    agentMode: AgentMode.STRICT_PAYMENTS,
    allowSuperPermissions: false,
    customAgentPermissions: ethers.ZeroHash,
    allowedCallsByAgent: [{
      agent: operator.address,
      allowedCalls: encodeAllowedCalls([merchant, limitedRecipient, outsider]),
    }],
  });
  const receipt = await deployTx.wait();

  const deployedEvent = receipt!.logs
    .map((log) => {
      try { return registry.interface.parseLog(log as any); } catch { return null; }
    })
    .find((parsed) => parsed?.name === "VaultDeployed");

  if (!deployedEvent) {
    throw new Error("VaultDeployed event not found");
  }

  const safeAddress = deployedEvent.args.safe as string;
  const keyManagerAddress = deployedEvent.args.keyManager as string;
  const policyEngineAddress = deployedEvent.args.policyEngine as string;

  const safe = await ethers.getContractAt("AgentSafe", safeAddress);
  const keyManager = await ethers.getContractAt("LSP6KeyManager", keyManagerAddress);
  const policyEngine = await ethers.getContractAt("PolicyEngine", policyEngineAddress);

  await safe.connect(operator).acceptOwnership();
  await operator.sendTransaction({ to: safeAddress, value: ethers.parseEther("5") });

  const payPayload = (recipient: string, amount: bigint) =>
    safe.interface.encodeFunctionData("execute", [0, recipient, amount, "0x"]);

  console.log("\n[1/4] Successful limited recipient payment...");
  await (await keyManager.connect(operator).execute(payPayload(limitedRecipient, ethers.parseEther("1")))).wait();
  console.log("   Success: 1 LYX sent to limited recipient");

  console.log("\n[2/4] Over-limit recipient attempt via static call...");
  await expectStaticRevert(
    "recipient over-limit",
    keyManager.connect(operator).execute.staticCall(payPayload(limitedRecipient, ethers.parseEther("0.1"))),
    "RBP: recipient limit exceeded",
  );

  console.log("\n[3/4] Outsider attempt via static call...");
  await expectStaticRevert(
    "outsider payment",
    keyManager.connect(operator).execute.staticCall(payPayload(outsider, ethers.parseEther("0.1"))),
    "MP: merchant not whitelisted",
  );

  console.log("\n[4/4] Vault ceiling check...");
  await (await keyManager.connect(operator).execute(payPayload(merchant, ethers.parseEther("2")))).wait();
  await expectStaticRevert(
    "vault budget exceeded",
    keyManager.connect(operator).execute.staticCall(payPayload(merchant, ethers.parseEther("0.1"))),
    "BP: budget exceeded",
  );

  const result = {
    network: network.name,
    chainId: Number(network.chainId),
    operator: operator.address,
    safeAddress,
    keyManagerAddress,
    policyEngineAddress,
    merchant,
    limitedRecipient,
    outsider,
  };

  const outputPath = path.join(__dirname, "..", "deployments", `live-stress-${network.chainId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log("\nLive stress script completed.");
  console.log(`Artifact written to ${outputPath}`);
}

main().catch((error) => {
  console.error("Live stress script failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});