/**
 * MissionPermissions.test.ts — Mission Manager controller key lifecycle tests.
 *
 * Tests the core security invariants of the Mission Manager:
 *  1. Owner adds a dynamic controller key via setData → controller can pay allowed target
 *  2. AllowedCalls enforced  → controller blocked from paying non-whitelisted address
 *  3. Stranger (no permissions) is rejected by KM
 *  4. Owner revokes controller (permissions → 0x0) → all future calls blocked
 *  5. Budget limit enforced  → payment exceeding budget reverts via PolicyEngine
 *  6. SUBSCRIPTIONS permission bitmask stored correctly (0x400A00 = CALL | TRANSFERVALUE | EXECUTE_RELAY_CALL)
 *
 * Pattern: a new EOA (controller) is added AFTER vault deployment via setData()
 * rather than at deploy time, which is how the Mission Manager works.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type { HDNodeWallet } from "ethers";
import {
  AgentVaultRegistry,
  AgentVaultDeployerCore,
  AgentVaultDeployer,
  AgentKMDeployer,
  AgentSafe,
  BudgetPolicy,
} from "../typechain-types";
import {
  AP_ARRAY_KEY,
  apArrayElementKey,
  apPermissionsKey,
  apAllowedCallsKey,
  decodeArrayLength,
  decodePermissions,
  encodeAllowedCalls,
  PERM_STRICT_PAYMENTS,
  PERM_SUBSCRIPTIONS,
  AgentMode,
} from "../scripts/lsp6Keys";

// ─── Constants ────────────────────────────────────────────────────────────────

const VAULT_BUDGET  = ethers.parseEther("10");
const PAY_AMOUNT    = ethers.parseEther("1");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Encodes a 32-byte ERC725Y permission value from a bigint bitmask. */
function encodePermission(perm: bigint): string {
  return "0x" + perm.toString(16).padStart(64, "0");
}

/** Encodes a uint128 array-length value for AP_ARRAY_KEY (16 bytes per ERC725Y LSP6 spec). */
function encodeArrayLength(n: number): string {
  return "0x" + n.toString(16).padStart(32, "0"); // 16 bytes = 32 hex chars
}

/** Encodes a 20-byte address value for ERC725Y array element keys. */
function encodeAddress(addr: string): string {
  return addr.toLowerCase();
}

// ─── Fixture ─────────────────────────────────────────────────────────────────

describe("MissionPermissions — dynamic controller key lifecycle", function () {
  let owner: SignerWithAddress;
  let merchant: SignerWithAddress;
  let nonMerchant: SignerWithAddress;
  let stranger: SignerWithAddress;

  let registry: AgentVaultRegistry;
  let safe: AgentSafe;
  let kmContract: any;
  let budgetPolicy: BudgetPolicy;

  /** A freshly-generated wallet representing the Mission Manager controller key */
  let controller: HDNodeWallet;

  beforeEach(async function () {
    [owner, merchant, nonMerchant, stranger] = await ethers.getSigners();

    // ── Deploy infrastructure ──────────────────────────────────────────────
    const coreC    = await ethers.getContractFactory("AgentVaultDeployerCore");
    const deployerC = await ethers.getContractFactory("AgentVaultDeployer");
    const optC     = await ethers.getContractFactory("AgentVaultOptionalPolicyDeployer");
    const kmC      = await ethers.getContractFactory("AgentKMDeployer");
    const msC      = await ethers.getContractFactory("MultisigControllerDeployer");
    const regC     = await ethers.getContractFactory("AgentVaultRegistry");
    const coordC   = await ethers.getContractFactory("AgentCoordinator");
    const poolC    = await ethers.getContractFactory("SharedBudgetPool");

    const vdCore = await coreC.deploy()     as AgentVaultDeployerCore;
    const vd     = await deployerC.deploy() as AgentVaultDeployer;
    const opt    = await optC.deploy();
    const km     = await kmC.deploy()       as AgentKMDeployer;
    const ms     = await msC.deploy();
    const coord  = await coordC.deploy();
    const pool   = await poolC.deploy(owner.address);

    registry = await regC.deploy(
      await vdCore.getAddress(),
      await vd.getAddress(),
      await opt.getAddress(),
      await km.getAddress(),
      await coord.getAddress(),
      await pool.getAddress(),
      await ms.getAddress(),
    ) as AgentVaultRegistry;

    // ── Deploy vault (NO agents at creation — controller added dynamically) ─
    const tx = await registry.connect(owner).deployVault({
      budget:                 VAULT_BUDGET,
      period:                 1, // WEEKLY
      budgetToken:            ethers.ZeroAddress,
      expiration:             0,
      agents:                 [], // ← Mission Manager adds them via setData
      agentBudgets:           [],
      merchants:              [merchant.address],
      label:                  "Mission Vault",
      agentMode:              AgentMode.STRICT_PAYMENTS,
      allowSuperPermissions:  false,
      customAgentPermissions: ethers.ZeroHash,
      allowedCallsByAgent:    [],
      recipientConfigs:       [],
      multisigSigners:        [],
      multisigThreshold:      0,
      multisigTimeLock:       0,
    });
    const receipt = await tx.wait();

    const event = receipt!.logs
      .map((log) => {
        try { return registry.interface.parseLog(log as Parameters<typeof registry.interface.parseLog>[0]); }
        catch { return null; }
      })
      .find((e) => e?.name === "VaultDeployed");

    const safeAddr = event!.args.safe as string;
    const kmAddr   = event!.args.keyManager as string;
    const peAddr   = event!.args.policyEngine as string;

    safe       = await ethers.getContractAt("AgentSafe", safeAddr)    as AgentSafe;
    kmContract = await ethers.getContractAt("LSP6KeyManager", kmAddr);

    const pe = await ethers.getContractAt("PolicyEngine", peAddr);
    const policies = await pe.getPolicies();
    budgetPolicy = await ethers.getContractAt("BudgetPolicy", policies[0]) as BudgetPolicy;

    // Accept LSP14 ownership transfer
    await safe.connect(owner).acceptOwnership();

    // Fund safe
    await owner.sendTransaction({ to: safeAddr, value: VAULT_BUDGET });

    // ── Generate the controller wallet (simulates Mission Manager key gen) ──
    controller = ethers.Wallet.createRandom();
  });

  // ─── Helper: grant STRICT_PAYMENTS to controller via owner setData ─────────

  async function grantController(
    controllerAddr: string,
    permBigint: bigint,
    allowedTargets: string[] = [merchant.address],
  ) {
    const safeAddr      = await safe.getAddress();
    const currentLength = decodeArrayLength(await safe.getData(AP_ARRAY_KEY));
    const newIndex      = currentLength; // 0-indexed: owner=0, then this controller

    const keys   = [
      AP_ARRAY_KEY,
      apArrayElementKey(newIndex),
      apPermissionsKey(controllerAddr),
      apAllowedCallsKey(controllerAddr),
    ];
    const values = [
      encodeArrayLength(currentLength + 1),
      encodeAddress(controllerAddr),
      encodePermission(permBigint),
      allowedTargets.length > 0 ? encodeAllowedCalls(allowedTargets) : "0x",
    ];

    // setDataBatch must be called directly by the owner (not via KM).
    // LSP9Vault guards setData to the direct owner; the KM is an execute-layer.
    await safe.connect(owner).setDataBatch(keys, values);
  }

  /** Encode a safe.execute(CALL, to, amount, 0x) calldata for km.execute(). */
  function payCalldata(to: string, amount: bigint) {
    return safe.interface.encodeFunctionData("execute", [
      0,   // operationType = CALL
      to,
      amount,
      "0x",
    ]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 1 — Controller can pay whitelisted merchant after setData grant
  // ═══════════════════════════════════════════════════════════════════════════

  it("TC-1: controller can pay whitelisted merchant after setData grant", async function () {
    await grantController(controller.address, BigInt(PERM_STRICT_PAYMENTS));

    const provider = ethers.provider;
    const connectedController = controller.connect(provider);

    // Fund controller just enough for gas
    await owner.sendTransaction({ to: controller.address, value: ethers.parseEther("0.1") });

    const balanceBefore = await provider.getBalance(merchant.address);

    const payload = payCalldata(merchant.address, PAY_AMOUNT);
    await kmContract.connect(connectedController).execute(payload);

    const balanceAfter = await provider.getBalance(merchant.address);
    expect(balanceAfter - balanceBefore).to.equal(PAY_AMOUNT);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 2 — AllowedCalls blocks payment to non-whitelisted address
  // ═══════════════════════════════════════════════════════════════════════════

  it("TC-2: AllowedCalls blocks controller from paying non-whitelisted address", async function () {
    await grantController(controller.address, BigInt(PERM_STRICT_PAYMENTS));

    const provider = ethers.provider;
    const connectedController = controller.connect(provider);
    await owner.sendTransaction({ to: controller.address, value: ethers.parseEther("0.1") });

    // nonMerchant is NOT in the AllowedCalls list → should be rejected by KM
    const payload = payCalldata(nonMerchant.address, PAY_AMOUNT);
    await expect(
      kmContract.connect(connectedController).execute(payload)
    ).to.be.reverted;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 3 — Stranger (never granted) is rejected by KeyManager
  // ═══════════════════════════════════════════════════════════════════════════

  it("TC-3: stranger with no permissions cannot execute anything", async function () {
    const payload = payCalldata(merchant.address, PAY_AMOUNT);
    await expect(
      kmContract.connect(stranger).execute(payload)
    ).to.be.reverted;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 4 — Revoked controller (permissions → 0x0) cannot execute
  // ═══════════════════════════════════════════════════════════════════════════

  it("TC-4: revoked controller (zeroed permissions) cannot execute", async function () {
    await grantController(controller.address, BigInt(PERM_STRICT_PAYMENTS));

    const provider = ethers.provider;
    const connectedController = controller.connect(provider);
    await owner.sendTransaction({ to: controller.address, value: ethers.parseEther("0.1") });

    // Sanity: confirm controller can pay before revocation
    const payload = payCalldata(merchant.address, PAY_AMOUNT);
    await kmContract.connect(connectedController).execute(payload);

    // ── Revoke: set permissions to 32 zero bytes ───────────────────────────
    const ZERO_PERMS = "0x" + "00".repeat(32);
    await safe.connect(owner).setData(
      apPermissionsKey(controller.address),
      ZERO_PERMS,
    );

    // ── Verify on-chain storage ────────────────────────────────────────────
    const storedPerms = await safe.getData(apPermissionsKey(controller.address));
    expect(decodePermissions(storedPerms)).to.equal(0n);

    // ── Confirm controller is now blocked ──────────────────────────────────
    await expect(
      kmContract.connect(connectedController).execute(payload)
    ).to.be.reverted;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 5 — Budget limit enforced: exceeding budget reverts via PolicyEngine
  // ═══════════════════════════════════════════════════════════════════════════

  it("TC-5: payment exceeding vault budget is blocked by PolicyEngine", async function () {
    await grantController(controller.address, BigInt(PERM_STRICT_PAYMENTS));

    const provider = ethers.provider;
    const connectedController = controller.connect(provider);
    await owner.sendTransaction({ to: controller.address, value: ethers.parseEther("0.1") });

    // VAULT_BUDGET = 10 ETH; fund with more to separate budget limit from balance limit
    await owner.sendTransaction({ to: await safe.getAddress(), value: ethers.parseEther("100") });

    // This amount exceeds VAULT_BUDGET (10 ETH) in a single tx
    const overBudget = VAULT_BUDGET + ethers.parseEther("1");
    const payload = payCalldata(merchant.address, overBudget);

    await expect(
      kmContract.connect(connectedController).execute(payload)
    ).to.be.reverted;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 6 — SUBSCRIPTIONS permission bits stored correctly (0x400A00)
  // ═══════════════════════════════════════════════════════════════════════════

  it("TC-6: SUBSCRIPTIONS permission (0x400A00) stored and retrieved correctly", async function () {
    await grantController(controller.address, BigInt(PERM_SUBSCRIPTIONS));

    const raw = await safe.getData(apPermissionsKey(controller.address));
    const stored = decodePermissions(raw);

    expect(stored).to.equal(BigInt(PERM_SUBSCRIPTIONS));
    // Confirm CALL (0x800) and TRANSFERVALUE (0x200) bits are set
    expect(stored & BigInt("0xA00")).to.equal(BigInt("0xA00"));
    // Confirm EXECUTE_RELAY_CALL (0x400000) bit is set
    expect(stored & BigInt("0x400000")).to.equal(BigInt("0x400000"));
    // Confirm no SUPER bits (≥ 0x100) are set in the super range
    expect(stored & BigInt("0x25500")).to.equal(0n);
  });
});
