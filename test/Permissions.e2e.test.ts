/**
 * Permissions.e2e.test.ts — End-to-end LSP6 permission storage + execution test.
 *
 * Purpose: assert that after deployVault():
 *  1. ERC725Y storage is exactly correct (AP array length, element addresses, permission bitmaps)
 *  2. An agent can actually execute a real LYX transfer through KM.execute()
 *  3. The PolicyEngine is invoked (budget.spent increases)
 *  4. A non-registered controller is rejected by the KeyManager
 *  5. Documents the known gap: SUPER_CALL (0x400) bypasses AllowedCalls lists
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
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
  decodeControllerAddress,
  SUPER_PERM,
  PERM_STRICT_PAYMENTS,
  PERM_POWER_USER,
  AgentMode,
  hasSuperBits,
  encodeAllowedCalls,
} from "../scripts/lsp6Keys";

describe("Permissions — E2E storage + execution", function () {
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let merchant: SignerWithAddress;
  let stranger: SignerWithAddress;
  let registry: AgentVaultRegistry;

  const BUDGET = ethers.parseEther("100");

  beforeEach(async function () {
    [owner, agent, merchant, stranger] = await ethers.getSigners();

    const coreC    = await ethers.getContractFactory("AgentVaultDeployerCore");
    const deployerC = await ethers.getContractFactory("AgentVaultDeployer");
    const kmC      = await ethers.getContractFactory("AgentKMDeployer");
    const regC     = await ethers.getContractFactory("AgentVaultRegistry");
    const coordC   = await ethers.getContractFactory("AgentCoordinator");
    const poolC    = await ethers.getContractFactory("SharedBudgetPool");

    const vdCore = await coreC.deploy() as AgentVaultDeployerCore;
    const vd     = await deployerC.deploy() as AgentVaultDeployer;
    const km     = await kmC.deploy() as AgentKMDeployer;
    // Coordinator and pool are required by the Registry constructor but not exercised
    // in these permission-focused tests. Deploy real instances as stubs.
    const coord  = await coordC.deploy();
    const pool   = await poolC.deploy(owner.address); // owner as dummy authorizedPolicy

    registry = await regC.deploy(
      await vdCore.getAddress(),
      await vd.getAddress(),
      await km.getAddress(),
      await coord.getAddress(),
      await pool.getAddress(),
    ) as AgentVaultRegistry;
  });

  // ─── Deployment helper ────────────────────────────────────────────────────

  async function deployVaultFull() {
    const tx = await registry.connect(owner).deployVault({
      budget:      BUDGET,
      period:      1, // WEEKLY
      budgetToken: ethers.ZeroAddress,
      expiration:  0,
      agents:      [agent.address],
      agentBudgets: [],
      merchants:   [merchant.address],
      label:       "E2E Test Vault",
      // STRICT_PAYMENTS: no SUPER_* bits; AllowedCalls enforced by LSP6 KeyManager
      agentMode:              AgentMode.STRICT_PAYMENTS,
      allowSuperPermissions:  false,
      customAgentPermissions: ethers.ZeroHash,
      allowedCallsByAgent:    [{ agent: agent.address, allowedCalls: encodeAllowedCalls([merchant.address]) }],
    });
    const receipt = await tx.wait();

    const event = receipt!.logs
      .map((log) => { try { return registry.interface.parseLog(log as any); } catch { return null; } })
      .find((e) => e?.name === "VaultDeployed");

    const safeAddr = event!.args.safe;
    const kmAddr   = event!.args.keyManager;
    const peAddr   = event!.args.policyEngine;

    const safe = await ethers.getContractAt("AgentSafe", safeAddr) as AgentSafe;
    const kmContract = await ethers.getContractAt("LSP6KeyManager", kmAddr);
    const pe   = await ethers.getContractAt("PolicyEngine", peAddr);

    // Accept LSP14 two-step ownership
    await safe.connect(owner).acceptOwnership();

    // Fund safe
    await owner.sendTransaction({ to: safeAddr, value: BUDGET });

    return { safe, kmContract, pe, safeAddr, kmAddr, peAddr };
  }

  // ─── P0.1: ERC725Y storage assertions ────────────────────────────────────

  describe("ERC725Y storage verification after deployVault", function () {
    it("AddressPermissions[] length = 2 (owner + 1 agent)", async function () {
      const { safe } = await deployVaultFull();
      const raw = await safe.getData(AP_ARRAY_KEY);
      expect(decodeArrayLength(raw)).to.equal(2);
    });

    it("AddressPermissions[0] = owner address", async function () {
      const { safe } = await deployVaultFull();
      const raw = await safe.getData(apArrayElementKey(0));
      expect(decodeControllerAddress(raw).toLowerCase()).to.equal(owner.address.toLowerCase());
    });

    it("AddressPermissions[1] = agent address", async function () {
      const { safe } = await deployVaultFull();
      const raw = await safe.getData(apArrayElementKey(1));
      expect(decodeControllerAddress(raw).toLowerCase()).to.equal(agent.address.toLowerCase());
    });

    it("AddressPermissions:Permissions:<owner> = SUPER_PERM (all bits set)", async function () {
      const { safe } = await deployVaultFull();
      const raw = await safe.getData(apPermissionsKey(owner.address));
      expect(decodePermissions(raw)).to.equal(BigInt(SUPER_PERM));
    });

    it("AddressPermissions:Permissions:<agent> = PERM_STRICT_PAYMENTS (0xA00)", async function () {
      const { safe } = await deployVaultFull();
      const raw = await safe.getData(apPermissionsKey(agent.address));
      expect(decodePermissions(raw)).to.equal(BigInt(PERM_STRICT_PAYMENTS));
    });

    it("AddressPermissions:Permissions:<stranger> = 0 (no permissions)", async function () {
      const { safe } = await deployVaultFull();
      const raw = await safe.getData(apPermissionsKey(stranger.address));
      expect(decodePermissions(raw)).to.equal(0n);
    });

    it("AddressPermissions[] length increases correctly with multiple agents", async function () {
      const extra = ethers.Wallet.createRandom().address;
      const tx = await registry.connect(owner).deployVault({
        budget: BUDGET, period: 1, budgetToken: ethers.ZeroAddress,
        expiration: 0, agents: [agent.address, extra],
        agentBudgets: [], merchants: [], label: "Multi-agent vault",
        // OPS_ADMIN: SETDATA only, no AllowedCalls requirement
        agentMode: AgentMode.OPS_ADMIN,
        allowSuperPermissions: false,
        customAgentPermissions: ethers.ZeroHash,
        allowedCallsByAgent: [],
      });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((log) => { try { return registry.interface.parseLog(log as any); } catch { return null; } })
        .find((e) => e?.name === "VaultDeployed");
      const safe = await ethers.getContractAt("AgentSafe", event!.args.safe);
      const raw = await safe.getData(AP_ARRAY_KEY);
      expect(decodeArrayLength(raw)).to.equal(3); // owner + 2 agents
    });
  });

  // ─── P0.3: Real execution through KM ─────────────────────────────────────

  describe("Real execution via KM.execute → storage + balance delta", function () {
    it("agent can pay whitelisted merchant — balance delta matches", async function () {
      const { safe, kmContract } = await deployVaultFull();
      const payAmount = ethers.parseEther("10");

      const before = await ethers.provider.getBalance(merchant.address);

      const calldata = safe.interface.encodeFunctionData("execute", [
        0, merchant.address, payAmount, "0x",
      ]);
      await kmContract.connect(agent).execute(calldata);

      const after = await ethers.provider.getBalance(merchant.address);
      expect(after - before).to.equal(payAmount);
    });

    it("agent payment updates PolicyEngine budget (spent increases)", async function () {
      const { safe, kmContract, pe } = await deployVaultFull();
      const payAmount = ethers.parseEther("10");

      const policies = await pe.getPolicies();
      const budgetPolicy = await ethers.getContractAt("BudgetPolicy", policies[0]) as BudgetPolicy;
      const spentBefore = await budgetPolicy.spent();

      const calldata = safe.interface.encodeFunctionData("execute", [
        0, merchant.address, payAmount, "0x",
      ]);
      await kmContract.connect(agent).execute(calldata);

      const spentAfter = await budgetPolicy.spent();
      expect(spentAfter - spentBefore).to.equal(payAmount);
      expect(spentAfter).to.be.greaterThan(spentBefore, "spent must increase after payment");
    });

    it("multiple sequential payments — safe balance matches all outflows", async function () {
      const { safe, kmContract } = await deployVaultFull();
      const payment = ethers.parseEther("5");

      const safeBefore = await ethers.provider.getBalance(await safe.getAddress());
      for (let i = 0; i < 3; i++) {
        const cd = safe.interface.encodeFunctionData("execute", [0, merchant.address, payment, "0x"]);
        await kmContract.connect(agent).execute(cd);
      }
      const safeAfter = await ethers.provider.getBalance(await safe.getAddress());
      expect(safeBefore - safeAfter).to.equal(payment * 3n);
    });
  });

  // ─── P0.3: Negative case — non-registered controller ──────────────────────

  describe("Negative: unregistered controller is rejected", function () {
    it("stranger calling KM.execute is reverted by LSP6", async function () {
      const { safe, kmContract } = await deployVaultFull();
      const calldata = safe.interface.encodeFunctionData("execute", [
        0, merchant.address, ethers.parseEther("1"), "0x",
      ]);
      await expect(kmContract.connect(stranger).execute(calldata)).to.be.reverted;
    });

    it("stranger cannot pay non-whitelisted merchant even if they had agent permissions", async function () {
      const { safe, kmContract } = await deployVaultFull();
      // stranger = zero permissions; send to non-merchant attacker address
      const calldata = safe.interface.encodeFunctionData("execute", [
        0, stranger.address, ethers.parseEther("1"), "0x",
      ]);
      await expect(kmContract.connect(agent).execute(calldata)).to.be.reverted;
    });

    it("agent cannot exceed vault budget", async function () {
      const { safe, kmContract } = await deployVaultFull();
      const overBudget = BUDGET + ethers.parseEther("1");
      await owner.sendTransaction({ to: await safe.getAddress(), value: overBudget });

      const calldata = safe.interface.encodeFunctionData("execute", [
        0, merchant.address, overBudget, "0x",
      ]);
      await expect(kmContract.connect(agent).execute(calldata)).to.be.reverted;
    });
  });

  // ─── Permission mode tests ──────────────────────────────────────────────────

  describe("Permission modes — AllowedCalls enforcement", function () {
    it("STRICT_PAYMENTS: no SUPER_* bits, AllowedCalls key written with merchant", async function () {
      const { safe } = await deployVaultFull();

      const permRaw = await safe.getData(apPermissionsKey(agent.address));
      const perm = decodePermissions(permRaw);

      // No SUPER bits — AllowedCalls is enforced by LSP6 KeyManager
      expect(hasSuperBits(perm)).to.be.false;
      // CALL bit (0x800) set
      expect(perm & 0x800n).to.equal(0x800n);
      // AllowedCalls key is non-empty
      const acRaw = await safe.getData(apAllowedCallsKey(agent.address));
      expect(acRaw).to.not.equal("0x", "AllowedCalls must be written for STRICT_PAYMENTS mode");
      expect(acRaw.length).to.be.greaterThan(2);
    });

    it("POWER_USER (CUSTOM + allowSuperPermissions=true): SUPER_* bits set, AllowedCalls empty", async function () {
      const tx = await registry.connect(owner).deployVault({
        budget: BUDGET, period: 1, budgetToken: ethers.ZeroAddress, expiration: 0,
        agents: [agent.address], agentBudgets: [], merchants: [merchant.address],
        label: "Power User Vault",
        agentMode:              AgentMode.CUSTOM,
        allowSuperPermissions:  true,
        customAgentPermissions: PERM_POWER_USER as `0x${string}`,
        allowedCallsByAgent:    [],
      });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((log) => { try { return registry.interface.parseLog(log as any); } catch { return null; } })
        .find((e) => e?.name === "VaultDeployed");
      const safe = await ethers.getContractAt("AgentSafe", event!.args.safe) as AgentSafe;

      const perm = decodePermissions(await safe.getData(apPermissionsKey(agent.address)));
      // SUPER bits must be present
      expect(hasSuperBits(perm)).to.be.true;
      // AllowedCalls NOT written when SUPER bits set
      const acRaw = await safe.getData(apAllowedCallsKey(agent.address));
      expect(acRaw).to.equal("0x", "AllowedCalls must be empty when SUPER_* bits are present");
    });

    it("CUSTOM super bits without allowSuperPermissions=true reverts", async function () {
      await expect(
        registry.connect(owner).deployVault({
          budget: BUDGET, period: 1, budgetToken: ethers.ZeroAddress, expiration: 0,
          agents: [agent.address], agentBudgets: [], merchants: [merchant.address],
          label: "Sneaky Vault",
          agentMode:              AgentMode.CUSTOM,
          allowSuperPermissions:  false,
          customAgentPermissions: PERM_POWER_USER as `0x${string}`,
          allowedCallsByAgent:    [],
        })
      ).to.be.revertedWith("Registry: super permissions disabled");
    });
  });
});
