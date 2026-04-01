/**
 * deployMultisig.ts — Deploy a MultisigController and wire it into an existing AgentSafe vault.
 *
 * The deployer must be the current owner of the target vault (so they can call setDataBatch
 * directly on the ERC725Y store via the KeyManager).
 *
 * Environment variables (or .env):
 *   SAFE_ADDRESS       — Address of the existing AgentSafe vault
 *   KM_ADDRESS         — Address of the associated LSP6KeyManager
 *   SIGNERS            — Comma-separated list of signer addresses (EOA or UP)
 *   THRESHOLD          — Minimum approvals required to execute (integer ≥ 1)
 *   TIMELOCK           — Global timelock in seconds (default: 0)
 *   ALLOWED_TARGETS    — Optional comma-separated addresses to add to AllowedCalls.
 *                        IMPORTANT: AllowedCalls is checked against the FINAL target of
 *                        ERC725X.execute(), i.e. the payment recipient or called contract —
 *                        NOT the vault address. Vault admin proposals need safeAddress here
 *                        (already included by default). For LYX payments, add the recipient;
 *                        for LSP7 transfers, add the token contract address.
 *   REVOKE_DEPLOYER    — If "true", zero out the deployer's own LSP6 permissions after
 *                        wiring (transfers full control to the multisig)
 *
 * Output: deployments/multisig-{chainId}.json
 *
 * Usage:
 *   npx hardhat run scripts/deployMultisig.ts --network luksoTestnet
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import {
  AP_ARRAY_KEY,
  apArrayElementKey,
  apPermissionsKey,
  apAllowedCallsKey,
  PERM_STRICT_PAYMENTS,
  encodeAllowedCalls,
  decodeArrayLength,
  verifyWrite,
} from "./lsp6Keys";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ─── Minimal IFaces ────────────────────────────────────────────────────────────

const ERC725Y_ABI = [
  "function getData(bytes32 key) external view returns (bytes memory)",
  "function setDataBatch(bytes32[] calldata keys, bytes[] calldata values) external",
  "function policyEngine() external view returns (address)",
];

const KM_ABI = [
  "function execute(bytes calldata payload) external payable returns (bytes memory)",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read from env; throw with a helpful message if missing. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`❌ Missing required env var: ${name}`);
  return v;
}

/** Parse comma-separated address list, filtering empty strings. */
function parseAddresses(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log("🔗 Network:", network.name, `(chainId: ${chainId})`);

  const [deployer] = await ethers.getSigners();
  console.log("📍 Deployer:", deployer.address);
  console.log(
    "💰 Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "LYX",
  );

  // ── Resolve vault addresses ─────────────────────────────────────────────────
  let safeAddress = process.env.SAFE_ADDRESS;
  let kmAddress   = process.env.KM_ADDRESS;

  if (!safeAddress || !kmAddress) {
    // Fall back to latest lukso-testnet deployment file
    const depPath = path.join(__dirname, "..", "deployments", `lukso-testnet-${chainId}.json`);
    if (fs.existsSync(depPath)) {
      const dep = JSON.parse(fs.readFileSync(depPath, "utf-8"));
      safeAddress = safeAddress ?? dep.agentSafeAddress;
      kmAddress   = kmAddress   ?? dep.keyManagerAddress;
      console.log("📂 Loaded addresses from", path.basename(depPath));
    }
  }

  if (!safeAddress || !ethers.isAddress(safeAddress))
    throw new Error("❌ SAFE_ADDRESS is not a valid address");
  if (!kmAddress || !ethers.isAddress(kmAddress))
    throw new Error("❌ KM_ADDRESS is not a valid address");

  console.log("🏛️  AgentSafe:     ", safeAddress);
  console.log("🔑  KeyManager:    ", kmAddress);

  // ── Parse signers + params ─────────────────────────────────────────────────
  const signers   = parseAddresses(required("SIGNERS"));
  const threshold = parseInt(required("THRESHOLD"), 10);
  const timeLock  = parseInt(process.env.TIMELOCK ?? "0", 10);
  const revokeDeployer = process.env.REVOKE_DEPLOYER === "true";

  const extraTargets = process.env.ALLOWED_TARGETS
    ? parseAddresses(process.env.ALLOWED_TARGETS)
    : [];

  if (signers.length === 0) throw new Error("❌ SIGNERS list is empty");
  if (isNaN(threshold) || threshold < 1 || threshold > signers.length)
    throw new Error(`❌ THRESHOLD (${threshold}) must be between 1 and ${signers.length}`);
  if (isNaN(timeLock) || timeLock < 0)
    throw new Error("❌ TIMELOCK must be a non-negative integer (seconds)");

  console.log("\n📋 MultisigController parameters:");
  console.log("   Signers:   ", signers);
  console.log("   Threshold:", threshold, "of", signers.length);
  console.log("   Timelock: ", timeLock, "seconds");
  if (revokeDeployer) console.log("   ⚠️  REVOKE_DEPLOYER=true — deployer permissions will be zeroed");

  // ── Deploy MultisigController ───────────────────────────────────────────────
  console.log("\n[1/3] Deploying MultisigController...");
  const Factory = await ethers.getContractFactory("MultisigController");
  const ms = await Factory.deploy(safeAddress, kmAddress, signers, threshold, timeLock);
  await ms.waitForDeployment();
  const msAddr = await ms.getAddress();
  console.log("✅ MultisigController:", msAddr);

  // ── Wire LSP6 permissions via the KeyManager ───────────────────────────────
  console.log("\n[2/3] Wiring LSP6 permissions...");

  // The deployer calls KM.execute(payload) where payload encodes a setDataBatch on the vault.
  // The deployer must have a permission that allows SETDATA on the vault (SUPER_* or SETDATA).
  const safe = new ethers.Contract(safeAddress, ERC725Y_ABI, deployer);
  const km   = new ethers.Contract(kmAddress, KM_ABI, deployer);

  // Read current AP array length so we can append without overwriting existing entries
  const rawArrayLen = await safe.getData(AP_ARRAY_KEY);
  const currentLen  = decodeArrayLength(rawArrayLen);
  console.log("   Current AP array length:", currentLen);

  // ─── Auto-discover PolicyEngine ─────────────────────────────────────────────
  // AllowedCalls is validated by LSP6 against the FINAL target of ERC725X.execute():
  //   • vault admin proposals (setPolicyEngine, setKeyManager…) → safeAddress (always included)
  //   • PE admin proposals (addPolicy, pause…)                  → policyEngine address (auto-discovered)
  //   • payment recipients / token contracts                    → add via ALLOWED_TARGETS env var
  let discoveredPE: string | null = null;
  try {
    const peAddr: string = await safe.policyEngine();
    if (peAddr && peAddr !== ethers.ZeroAddress) {
      discoveredPE = peAddr;
      console.log("   Auto-discovered PolicyEngine:", peAddr);
    }
  } catch {
    console.log("   PolicyEngine getter not exposed — add PE via ALLOWED_TARGETS if needed");
  }

  const defaultTargets: string[] = [
    safeAddress,                                   // vault admin proposals
    ...(discoveredPE ? [discoveredPE] : []),        // PE admin proposals
    ...extraTargets,                                // payment recipients / token contracts
  ];
  const allowedCallsValue = encodeAllowedCalls(defaultTargets);

  // Keys to set:
  //   • MultisigController permissions (PERM_STRICT_PAYMENTS = CALL | TRANSFERVALUE)
  //   • MultisigController AllowedCalls
  //   • AP array element[currentLen] = MultisigController address
  //   • AP array length = currentLen + 1
  // Plus optionally: zero out deployer permissions (2 extra keys)

  const permKey        = apPermissionsKey(msAddr);
  const acKey          = apAllowedCallsKey(msAddr);
  const elementKey     = apArrayElementKey(currentLen);
  const newArrayLength = "0x" + (currentLen + 1).toString(16).padStart(32, "0");

  const keys: string[] = [permKey, acKey, elementKey, AP_ARRAY_KEY];
  const values: string[] = [
    PERM_STRICT_PAYMENTS,
    allowedCallsValue,
    ethers.zeroPadValue(msAddr, 32), // packed bytes20 in element slot
    newArrayLength,
  ];

  if (revokeDeployer) {
    const deployerPermKey = apPermissionsKey(deployer.address);
    keys.push(deployerPermKey);
    values.push("0x" + "0".repeat(64)); // zero out permissions
    console.log("   Adding deployer permission revocation to batch");
  }

  // Encode setDataBatch call to the vault
  const safeIface = new ethers.Interface([
    "function setDataBatch(bytes32[] calldata keys, bytes[] calldata values) external",
  ]);
  const innerPayload = safeIface.encodeFunctionData("setDataBatch", [keys, values]);

  // Execute via KM — deployer must have SETDATA (or SUPER_SETDATA) permission
  const tx = await km.execute(innerPayload);
  const receipt = await tx.wait();
  console.log("✅ setDataBatch executed in block:", receipt.blockNumber);

  // ── Verify writes ──────────────────────────────────────────────────────────
  console.log("\n[3/3] Verifying on-chain writes...");
  await verifyWrite(safe as any, permKey, PERM_STRICT_PAYMENTS, "MultisigController permissions");
  await verifyWrite(safe as any, acKey, allowedCallsValue, "MultisigController AllowedCalls");
  await verifyWrite(safe as any, AP_ARRAY_KEY, newArrayLength, "AP array length");

  // ── Extra semantic guards ─────────────────────────────────────────────────
  // 1. Confirm AP array element[currentLen] == MultisigController address
  const rawElem = await safe.getData(elementKey);
  const elemAddr = "0x" + rawElem.replace(/^0x/, "").toLowerCase().slice(-40);
  if (elemAddr !== msAddr.toLowerCase()) {
    throw new Error(
      `AP array element mismatch: expected ${msAddr.toLowerCase()} got ${elemAddr}`
    );
  }
  console.log("✅ AP array element[", currentLen, "] = MultisigController confirmed");

  // 2. Semantic check: AllowedCalls contains at least one entry for safeAddress
  //    with callType CALL|TRANSFERVALUE (0x00000003). CompactBytesArray format:
  //    each entry = 0x0020 (len) + 4-byte callType + 20-byte addr + 4-byte stdId + 4-byte sel = 34 bytes
  const acRaw = (await safe.getData(acKey)).replace(/^0x/, "").toLowerCase();
  const safeAddrHex = safeAddress.toLowerCase().replace(/^0x/, "");
  const expectedEntry = "0020" + "00000003" + safeAddrHex + "ffffffff" + "ffffffff";
  if (!acRaw.includes(expectedEntry)) {
    throw new Error(
      `AllowedCalls does not contain a valid CALL|TRANSFERVALUE entry for safeAddress (${safeAddress}).\n` +
      `Encoded AllowedCalls: 0x${acRaw}`
    );
  }
  console.log("✅ AllowedCalls semantic check: safeAddress present with CALL|TRANSFERVALUE");

  // 3. If REVOKE_DEPLOYER=true, confirm deployer permissions are zeroed
  if (revokeDeployer) {
    const deployerPermRaw = await safe.getData(apPermissionsKey(deployer.address));
    const deployerPerm = deployerPermRaw.replace(/^0x/, "").replace(/^0+$/, "");
    if (deployerPerm !== "") {
      throw new Error(
        `Deployer permissions NOT zeroed! Got: 0x${deployerPermRaw.replace(/^0x/, "")}`
      );
    }
    console.log("✅ Deployer permissions confirmed zero");
  }

  console.log("✅ All permission writes verified");

  // ── Save deployment artifact ────────────────────────────────────────────────
  const artifact = {
    network:                  network.name,
    chainId:                  chainId,
    deployer:                 deployer.address,
    safeAddress,
    keyManagerAddress:        kmAddress,
    multisigControllerAddress: msAddr,
    signers,
    threshold,
    timeLockSeconds:          timeLock,
    allowedTargets:           defaultTargets,
    deployerPermissionsRevoked: revokeDeployer,
    deploymentTimestamp:      Math.floor(Date.now() / 1000),
    blockNumber:              receipt.blockNumber,
  };

  const outPath = path.join(__dirname, "..", "deployments", `multisig-${chainId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log("\n📄 Deployment artifact saved to:", path.relative(process.cwd(), outPath));

  console.log("\n✅ Done! MultisigController is live:");
  console.log("   Address:   ", msAddr);
  console.log("   Vault:     ", safeAddress);
  console.log("   Signers:   ", signers.join(", "));
  console.log("   Threshold:", threshold, "of", signers.length);
  if (chainId === 4201) {
    console.log(`\n🔗 https://explorer.testnet.lukso.network/address/${msAddr}`);
  }

  if (!revokeDeployer) {
    console.log(
      "\n⚠️  Deployer still has permissions on the vault.",
      "Re-run with REVOKE_DEPLOYER=true to transfer full control to the multisig.",
    );
  }
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err.message ?? err);
  process.exit(1);
});
