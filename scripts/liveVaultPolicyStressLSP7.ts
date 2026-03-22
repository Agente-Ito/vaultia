import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { AgentMode, decodeHardhatError, encodeAllowedCalls } from "./lsp6Keys";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const WEEKLY = 1;
const TOKEN_BUDGET = ethers.parseEther("1");
const RECIPIENT_LIMIT = ethers.parseEther("0.3");
const TOKEN_MINT_AMOUNT = ethers.parseEther("1.1");
const LYX_SEED_AMOUNT = ethers.parseEther("0.2");
const LIMITED_RECIPIENT_PAYMENT_AMOUNT = RECIPIENT_LIMIT;
const LIMITED_RECIPIENT_OVER_LIMIT_AMOUNT = ethers.parseEther("0.1");
const MERCHANT_PAYMENT_AMOUNT = TOKEN_BUDGET - RECIPIENT_LIMIT;
const VAULT_OVER_BUDGET_AMOUNT = ethers.parseEther("0.1");
const WRONG_DENOMINATION_AMOUNT = ethers.parseEther("0.1");
const EXPLORER_BASE_URL = "https://explorer.testnet.lukso.network";

type OwnableLike = {
  owner(): Promise<string>;
  pendingOwner?: () => Promise<string>;
  connect(signer: typeof ethers.provider | any): any;
};

function getEnvAddress(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (!ethers.isAddress(value)) {
    throw new Error(`Invalid address in ${name}: ${value}`);
  }
  return value;
}

function getDeployedDemoTokenAddress(chainId: bigint) {
  const envValue = process.env.LIVE_STRESS_LSP7_TOKEN?.trim();
  if (envValue) {
    if (!ethers.isAddress(envValue)) {
      throw new Error(`Invalid address in LIVE_STRESS_LSP7_TOKEN: ${envValue}`);
    }
    return envValue;
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", `lukso-demo-token-${chainId}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Missing demo token deployment artifact at ${deploymentPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(deploymentPath, "utf8")) as { tokenAddress?: string };
  if (!parsed.tokenAddress || !ethers.isAddress(parsed.tokenAddress)) {
    throw new Error(`Invalid tokenAddress in ${deploymentPath}`);
  }

  return parsed.tokenAddress;
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

async function acceptOwnershipIfNeeded(
  label: string,
  contract: OwnableLike,
  operatorAddress: string,
  operator: any,
  toTxLink: (hash: string) => string,
) {
  const owner = await contract.owner();
  if (owner.toLowerCase() === operatorAddress.toLowerCase()) {
    console.log(`   ${label}: already owned by operator`);
    return null;
  }

  if (!contract.pendingOwner) {
    console.log(`   ${label}: no pendingOwner() exposed, skipping`);
    return null;
  }

  let pendingOwner: string;
  try {
    pendingOwner = await contract.pendingOwner();
  } catch {
    console.log(`   ${label}: pendingOwner() unavailable, skipping`);
    return null;
  }

  if (pendingOwner.toLowerCase() !== operatorAddress.toLowerCase()) {
    throw new Error(`${label}: operator is not pending owner`);
  }

  const tx = await contract.connect(operator).acceptOwnership();
  const receipt = await tx.wait();
  console.log(`   ${label}: accepted ownership`);
  return {
    hash: tx.hash,
    blockNumber: receipt?.blockNumber ?? null,
    link: toTxLink(tx.hash),
  };
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
  const tokenAddress = getDeployedDemoTokenAddress(network.chainId);

  const registry = await ethers.getContractAt("AgentVaultRegistry", registryAddress);
  const token = await ethers.getContractAt("LSP7DemoToken", tokenAddress);

  console.log("Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("Operator:", operator.address);
  console.log("Registry:", registryAddress);
  console.log("Token:", tokenAddress);
  console.log("Merchant:", merchant);
  console.log("Limited recipient:", limitedRecipient);
  console.log("Outsider:", outsider);

  const toAddressLink = (address: string) => `${EXPLORER_BASE_URL}/address/${address}`;
  const toTxLink = (hash: string) => `${EXPLORER_BASE_URL}/tx/${hash}`;

  const deployTx = await registry.connect(operator).deployVault({
    budget: TOKEN_BUDGET,
    period: WEEKLY,
    budgetToken: tokenAddress,
    expiration: 0,
    agents: [operator.address],
    agentBudgets: [],
    merchants: [merchant, limitedRecipient],
    recipientConfigs: [
      { recipient: merchant, budget: 0, period: WEEKLY },
      { recipient: limitedRecipient, budget: RECIPIENT_LIMIT, period: WEEKLY },
    ],
    label: `Live LSP7 Stress Vault ${Date.now()}`,
    agentMode: AgentMode.STRICT_PAYMENTS,
    allowSuperPermissions: false,
    customAgentPermissions: ethers.ZeroHash,
    allowedCallsByAgent: [{
      agent: operator.address,
      allowedCalls: encodeAllowedCalls([tokenAddress, merchant, limitedRecipient, outsider]),
    }],
  });
  const receipt = await deployTx.wait();
  if (!receipt) {
    throw new Error("deployVault receipt missing");
  }

  const deployedEvent = receipt.logs
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
  const deployedPolicies = await policyEngine.getPolicies();

  const acceptSafe = await acceptOwnershipIfNeeded("AgentSafe", safe as any, operator.address, operator, toTxLink);
  const acceptPolicyEngine = await acceptOwnershipIfNeeded("PolicyEngine", policyEngine as any, operator.address, operator, toTxLink);

  const acceptedPolicies: Array<{ address: string; hash: string; blockNumber: number | null; link: string }> = [];
  for (const policyAddress of deployedPolicies) {
    const policy = await ethers.getContractAt("BudgetPolicy", policyAddress);
    const accepted = await acceptOwnershipIfNeeded(`Policy ${policyAddress}`, policy as any, operator.address, operator, toTxLink);
    if (accepted) {
      acceptedPolicies.push({
        address: policyAddress,
        hash: accepted.hash,
        blockNumber: accepted.blockNumber,
        link: accepted.link,
      });
    }
  }

  const mintTx = await token.connect(operator).mint(safeAddress, TOKEN_MINT_AMOUNT);
  const mintReceipt = await mintTx.wait();

  const lyxSeedTx = await operator.sendTransaction({ to: safeAddress, value: LYX_SEED_AMOUNT });
  const lyxSeedReceipt = await lyxSeedTx.wait();

  const tokenTransferPayload = (recipient: string, amount: bigint) => {
    const transferData = token.interface.encodeFunctionData("transfer", [
      safeAddress,
      recipient,
      amount,
      true,
      "0x",
    ]);

    return safe.interface.encodeFunctionData("execute", [
      0,
      tokenAddress,
      0,
      transferData,
    ]);
  };

  const nativePayload = (recipient: string, amount: bigint) =>
    safe.interface.encodeFunctionData("execute", [0, recipient, amount, "0x"]);

  console.log("\n[1/5] Successful limited recipient token payment...");
  const limitedRecipientTx = await keyManager.connect(operator).execute(
    tokenTransferPayload(limitedRecipient, LIMITED_RECIPIENT_PAYMENT_AMOUNT)
  );
  const limitedRecipientReceipt = await limitedRecipientTx.wait();
  console.log(`   Success: ${ethers.formatEther(LIMITED_RECIPIENT_PAYMENT_AMOUNT)} tokens sent to limited recipient`);

  console.log("\n[2/5] Over-limit recipient attempt via static call...");
  await expectStaticRevert(
    "recipient over-limit",
    keyManager.connect(operator).execute.staticCall(
      tokenTransferPayload(limitedRecipient, LIMITED_RECIPIENT_OVER_LIMIT_AMOUNT)
    ),
    "RBP: recipient limit exceeded",
  );

  console.log("\n[3/5] Outsider token attempt via static call...");
  await expectStaticRevert(
    "outsider payment",
    keyManager.connect(operator).execute.staticCall(
      tokenTransferPayload(outsider, LIMITED_RECIPIENT_OVER_LIMIT_AMOUNT)
    ),
    "MP: merchant not whitelisted",
  );

  console.log("\n[4/5] Successful merchant token payment to fill budget...");
  const merchantFundingTx = await keyManager.connect(operator).execute(
    tokenTransferPayload(merchant, MERCHANT_PAYMENT_AMOUNT)
  );
  const merchantFundingReceipt = await merchantFundingTx.wait();
  console.log(`   Success: ${ethers.formatEther(MERCHANT_PAYMENT_AMOUNT)} tokens sent to merchant`);

  console.log("\n[5/5] Token budget and denomination checks...");
  await expectStaticRevert(
    "vault budget exceeded",
    keyManager.connect(operator).execute.staticCall(
      tokenTransferPayload(merchant, VAULT_OVER_BUDGET_AMOUNT)
    ),
    "BP: budget exceeded",
  );
  await expectStaticRevert(
    "wrong denomination",
    keyManager.connect(operator).execute.staticCall(nativePayload(merchant, WRONG_DENOMINATION_AMOUNT)),
    "BP: wrong denomination",
  );

  const result = {
    network: network.name,
    chainId: Number(network.chainId),
    explorerBaseUrl: EXPLORER_BASE_URL,
    operator: operator.address,
    registryAddress,
    tokenAddress,
    safeAddress,
    keyManagerAddress,
    policyEngineAddress,
    merchant,
    limitedRecipient,
    outsider,
    configuredTokenBudget: ethers.formatEther(TOKEN_BUDGET),
    configuredRecipientLimit: ethers.formatEther(RECIPIENT_LIMIT),
    tokenMintAmount: ethers.formatEther(TOKEN_MINT_AMOUNT),
    lyxSeedAmount: ethers.formatEther(LYX_SEED_AMOUNT),
    limitedRecipientPaymentAmount: ethers.formatEther(LIMITED_RECIPIENT_PAYMENT_AMOUNT),
    merchantPaymentAmount: ethers.formatEther(MERCHANT_PAYMENT_AMOUNT),
    blockNumber: receipt.blockNumber,
    transactions: {
      deployVault: {
        hash: deployTx.hash,
        blockNumber: receipt.blockNumber,
        link: toTxLink(deployTx.hash),
      },
      ...(acceptSafe ? {
        acceptSafeOwnership: {
          hash: acceptSafe.hash,
          blockNumber: acceptSafe.blockNumber,
          link: acceptSafe.link,
        },
      } : {}),
      ...(acceptPolicyEngine ? {
        acceptPolicyEngineOwnership: {
          hash: acceptPolicyEngine.hash,
          blockNumber: acceptPolicyEngine.blockNumber,
          link: acceptPolicyEngine.link,
        },
      } : {}),
      mintTokenToVault: {
        hash: mintTx.hash,
        blockNumber: mintReceipt?.blockNumber ?? null,
        link: toTxLink(mintTx.hash),
      },
      seedVaultLyx: {
        hash: lyxSeedTx.hash,
        blockNumber: lyxSeedReceipt?.blockNumber ?? null,
        link: toTxLink(lyxSeedTx.hash),
      },
      limitedRecipientPayment: {
        hash: limitedRecipientTx.hash,
        blockNumber: limitedRecipientReceipt?.blockNumber ?? null,
        link: toTxLink(limitedRecipientTx.hash),
      },
      merchantBudgetFillPayment: {
        hash: merchantFundingTx.hash,
        blockNumber: merchantFundingReceipt?.blockNumber ?? null,
        link: toTxLink(merchantFundingTx.hash),
      },
    },
    acceptedPolicies,
    staticChecks: {
      recipientOverLimit: {
        expectedReason: "RBP: recipient limit exceeded",
        transactionHash: null,
      },
      outsiderPayment: {
        expectedReason: "MP: merchant not whitelisted",
        transactionHash: null,
      },
      vaultBudgetExceeded: {
        expectedReason: "BP: budget exceeded",
        transactionHash: null,
      },
      wrongDenomination: {
        expectedReason: "BP: wrong denomination",
        transactionHash: null,
      },
    },
    links: {
      registry: toAddressLink(registryAddress),
      token: toAddressLink(tokenAddress),
      safe: toAddressLink(safeAddress),
      keyManager: toAddressLink(keyManagerAddress),
      policyEngine: toAddressLink(policyEngineAddress),
      operator: toAddressLink(operator.address),
      merchant: toAddressLink(merchant),
      limitedRecipient: toAddressLink(limitedRecipient),
      outsider: toAddressLink(outsider),
    },
  };

  const outputPath = path.join(__dirname, "..", "deployments", `live-stress-lsp7-${network.chainId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log("\nLive LSP7 stress script completed.");
  console.log(`Artifact written to ${outputPath}`);
  console.log("Explorer links:");
  console.log("   Token:      ", result.links.token);
  console.log("   Safe:       ", result.links.safe);
  console.log("   KeyManager: ", result.links.keyManager);
  console.log("   PolicyEngine:", result.links.policyEngine);
  console.log("Transaction links:");
  console.log("   deployVault:           ", result.transactions.deployVault.link);
  if ("acceptSafeOwnership" in result.transactions) {
    console.log("   acceptSafeOwnership:   ", result.transactions.acceptSafeOwnership.link);
  }
  if ("acceptPolicyEngineOwnership" in result.transactions) {
    console.log("   acceptPEOwnership:     ", result.transactions.acceptPolicyEngineOwnership.link);
  }
  console.log("   mintTokenToVault:      ", result.transactions.mintTokenToVault.link);
  console.log("   seedVaultLyx:          ", result.transactions.seedVaultLyx.link);
  console.log("   limitedRecipientPay:   ", result.transactions.limitedRecipientPayment.link);
  console.log("   merchantBudgetFillPay: ", result.transactions.merchantBudgetFillPayment.link);
  for (const acceptedPolicy of acceptedPolicies) {
    console.log(`   acceptPolicy ${acceptedPolicy.address}:`, acceptedPolicy.link);
  }
}

main().catch((error) => {
  console.error("Live LSP7 stress script failed:", decodeHardhatError(error));
  process.exitCode = 1;
});