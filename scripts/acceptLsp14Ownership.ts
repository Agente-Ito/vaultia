import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

type Ownable2StepLike = {
  getAddress(): Promise<string>;
  owner(): Promise<string>;
  pendingOwner(): Promise<string>;
  connect(signer: unknown): Ownable2StepLike & { acceptOwnership(): Promise<{ hash: string; wait(): Promise<{ blockNumber: number } | null> }> };
};

async function acceptIfPending(label: string, contract: Ownable2StepLike, operatorAddress: string, operator: unknown) {
  const address = await contract.getAddress();
  const owner = await contract.owner();

  console.log(`\n${label}`);
  console.log(`  address:       ${address}`);
  console.log(`  owner:         ${owner}`);

  if (owner.toLowerCase() === operatorAddress.toLowerCase()) {
    console.log("  pendingOwner:  n/a");
    console.log("  status:        already owned by operator");
    return;
  }

  let pendingOwner: string;
  try {
    pendingOwner = await contract.pendingOwner();
    console.log(`  pendingOwner:  ${pendingOwner}`);
  } catch {
    console.log("  pendingOwner:  unavailable");
    console.log("  status:        skipped (contract does not expose LSP14 pendingOwner)");
    return;
  }

  if (pendingOwner.toLowerCase() !== operatorAddress.toLowerCase()) {
    console.log("  status:        skipped (operator is not pending owner)");
    return;
  }

  const tx = await contract.connect(operator).acceptOwnership();
  const receipt = await tx.wait();
  console.log(`  accepted:      ${tx.hash} @ block ${receipt?.blockNumber ?? "?"}`);
}

async function main() {
  const safeAddress = process.env.TARGET_SAFE_ADDRESS || process.env.AGENT_SAFE_ADDRESS;
  const registryAddress = process.env.REGISTRY_ADDRESS;
  const configuredPolicyEngine = process.env.POLICY_ENGINE_ADDRESS;

  if (!safeAddress) {
    throw new Error("Missing TARGET_SAFE_ADDRESS or AGENT_SAFE_ADDRESS in environment");
  }

  const [operator] = await ethers.getSigners();
  const operatorAddress = operator.address;

  let policyEngineAddress = configuredPolicyEngine;
  if (registryAddress) {
    const registry = await ethers.getContractAt(
      "AgentVaultRegistry",
      registryAddress,
    );
    const vaults = await registry.getVaults(operatorAddress);
    const matchingVault = vaults.find((vault) => vault.safe.toLowerCase() === safeAddress.toLowerCase());
    policyEngineAddress = matchingVault?.policyEngine ?? policyEngineAddress ?? await registry.getPolicyEngine(safeAddress);
  }

  if (!policyEngineAddress || policyEngineAddress === ethers.ZeroAddress) {
    throw new Error("Unable to resolve PolicyEngine address. Set POLICY_ENGINE_ADDRESS or REGISTRY_ADDRESS.");
  }

  const safe = await ethers.getContractAt("AgentSafe", safeAddress) as unknown as Ownable2StepLike;
  const policyEngine = await ethers.getContractAt("PolicyEngine", policyEngineAddress) as unknown as Ownable2StepLike & {
    getPolicies(): Promise<string[]>;
  };

  console.log("Accepting LSP14 ownership across vault stack");
  console.log(`operator:      ${operatorAddress}`);
  console.log(`safe:          ${safeAddress}`);
  console.log(`policyEngine:  ${policyEngineAddress}`);

  await acceptIfPending("AgentSafe", safe, operatorAddress, operator);
  await acceptIfPending("PolicyEngine", policyEngine, operatorAddress, operator);

  const policies = await policyEngine.getPolicies();
  console.log(`\npolicies found: ${policies.length}`);
  for (let index = 0; index < policies.length; index++) {
    const policyAddress = policies[index];
    const policy = await ethers.getContractAt("BudgetPolicy", policyAddress) as unknown as Ownable2StepLike;
    await acceptIfPending(`Policy[${index}]`, policy, operatorAddress, operator);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});