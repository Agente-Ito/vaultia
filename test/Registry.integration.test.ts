import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  AgentVaultRegistry,
  AgentVaultDeployerCore,
  AgentVaultDeployer,
  AgentKMDeployer,
  AgentSafe,
  LSP6KeyManager,
  BudgetPolicy,
  MerchantPolicy,
} from "../typechain-types";
import {
  AP_ARRAY_KEY,
  apArrayElementKey,
  apPermissionsKey,
  decodeArrayLength,
  decodePermissions,
  decodeControllerAddress,
  SUPER_PERM,
  PERM_STRICT_PAYMENTS,
  PERM_OPS_ADMIN,
  PERM_POWER_USER,
  AgentMode,
  encodeAllowedCalls,
} from "../scripts/lsp6Keys";

describe("AgentVaultRegistry — Integration", function () {
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let merchant: SignerWithAddress;
  let registry: AgentVaultRegistry;

  const BUDGET = ethers.parseEther("200");

  beforeEach(async function () {
    [owner, agent, merchant] = await ethers.getSigners();

    const coreC = await ethers.getContractFactory("AgentVaultDeployerCore");
    const vdCore = await coreC.deploy() as AgentVaultDeployerCore;

    const deployerC = await ethers.getContractFactory("AgentVaultDeployer");
    const vd = await deployerC.deploy() as AgentVaultDeployer;

    const optC = await ethers.getContractFactory("AgentVaultOptionalPolicyDeployer");
    const optionalDeployer = await optC.deploy();

    const kmC = await ethers.getContractFactory("AgentKMDeployer");
    const km = await kmC.deploy() as AgentKMDeployer;

    const msC = await ethers.getContractFactory("MultisigControllerDeployer");
    const msDeployer = await msC.deploy();

    const coordC = await ethers.getContractFactory("AgentCoordinator");
    const coord  = await coordC.deploy();
    const poolC  = await ethers.getContractFactory("SharedBudgetPool");
    const pool   = await poolC.deploy(owner.address);

    const RegistryFactory = await ethers.getContractFactory("AgentVaultRegistry");
    registry = await RegistryFactory.deploy(
      await vdCore.getAddress(),
      await vd.getAddress(),
      await optionalDeployer.getAddress(),
      await km.getAddress(),
      await coord.getAddress(),
      await pool.getAddress(),
      await msDeployer.getAddress(),
    ) as AgentVaultRegistry;
  });

  async function deployVault(params?: Partial<{
    budget: bigint;
    period: number;
    budgetToken: string;
    expiration: number;
    agents: string[];
    agentBudgets: bigint[];
    merchants: string[];
    recipientConfigs: Array<{ recipient: string; budget: bigint; period: number }>;
    label: string;
    agentMode: number;
    allowSuperPermissions: boolean;
    customAgentPermissions: string;
    allowedCallsByAgent: Array<{ agent: string; allowedCalls: string }>;
    multisigSigners: string[];
    multisigThreshold: number;
    multisigTimeLock: number;
  }>) {
    const p = {
      budget: BUDGET,
      period: 1, // WEEKLY
      budgetToken: ethers.ZeroAddress,
      expiration: 0,
      agents: [agent.address],
      agentBudgets: [], // No per-agent budgets by default
      merchants: params?.merchants ?? [],
      recipientConfigs: [],
      label: "Test Vault",
      // Default: OPS_ADMIN — SETDATA only, no AllowedCalls required
      agentMode:              AgentMode.OPS_ADMIN,
      allowSuperPermissions:  false,
      customAgentPermissions: ethers.ZeroHash,
      allowedCallsByAgent:    [],
      multisigSigners:        [],
      multisigThreshold:      0,
      multisigTimeLock:       0,
      ...params,
    };
    return registry.connect(owner).deployVault(p);
  }

  describe("deployVault", function () {
    it("should deploy all vault components and emit VaultDeployed", async function () {
      const tx = await deployVault({ merchants: [merchant.address] });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((log) => {
          try { return registry.interface.parseLog(log as any); } catch { return null; }
        })
        .find((e) => e?.name === "VaultDeployed");

      expect(event).to.not.be.undefined;
      expect(event!.args.owner).to.equal(owner.address);
      expect(event!.args.chainId).to.equal(31337n);
    });

    it("should register vault in owner mapping", async function () {
      await deployVault();
      const vaults = await registry.getVaults(owner.address);
      expect(vaults.length).to.equal(1);
      expect(vaults[0].label).to.equal("Test Vault");
    });

    it("should register reverse lookups", async function () {
      await deployVault();
      const [vaultRecord] = await registry.getVaults(owner.address);
      expect(await registry.getKeyManager(vaultRecord.safe)).to.equal(vaultRecord.keyManager);
      expect(await registry.getPolicyEngine(vaultRecord.safe)).to.equal(vaultRecord.policyEngine);
    });

    it("should revert if too many agents (>20)", async function () {
      const agents = Array.from({ length: 21 }, () => ethers.Wallet.createRandom().address);
      await expect(deployVault({ agents })).to.be.revertedWith("Registry: too many agents");
    });

    it("should revert if too many merchants (>100)", async function () {
      const merchants = Array.from({ length: 101 }, () => ethers.Wallet.createRandom().address);
      await expect(deployVault({ merchants })).to.be.revertedWith("Registry: too many merchants");
    });

    it("STRICT_PAYMENTS without allowedCallsByAgent (length mismatch) reverts", async function () {
      await expect(
        deployVault({
          agentMode:              AgentMode.STRICT_PAYMENTS,
          allowedCallsByAgent:    [],   // length 0, but agents has 1 entry
        })
      ).to.be.revertedWith("Registry: AllowedCalls required for CALL permission");
    });

    it("CUSTOM super bits without allowSuperPermissions=true reverts", async function () {
      await expect(
        deployVault({
          agentMode:              AgentMode.CUSTOM,
          allowSuperPermissions:  false,
          customAgentPermissions: PERM_POWER_USER,
          allowedCallsByAgent:    [],
        })
      ).to.be.revertedWith("Registry: super permissions disabled");
    });

    it("should revert if expiration timestamp is in the past", async function () {
      const latest = await ethers.provider.getBlock('latest');
      const pastTimestamp = latest!.timestamp - 3600; // 1 hour before current block
      await expect(deployVault({ expiration: pastTimestamp }))
        .to.be.revertedWith("Registry: expiration in the past");
    });

    it("should accept expiration timestamp in the future", async function () {
      const latest = await ethers.provider.getBlock('latest');
      const futureTimestamp = latest!.timestamp + 7 * 24 * 3600; // 1 week after current block
      await expect(deployVault({ expiration: futureTimestamp })).to.not.be.reverted;
    });

    it("should deploy multiple vaults for same owner", async function () {
      await deployVault({ label: "Vault A" });
      await deployVault({ label: "Vault B" });
      const vaults = await registry.getVaults(owner.address);
      expect(vaults.length).to.equal(2);
    });
  });

  describe("LSP14 two-step ownership transfer", function () {
    it("full flow: deployVault → acceptOwnership across the LSP14 stack → agent still works", async function () {
      const tx = await deployVault({
        merchants: [merchant.address],
        agentMode: AgentMode.STRICT_PAYMENTS,
        allowedCallsByAgent: [{ agent: agent.address, allowedCalls: encodeAllowedCalls([merchant.address]) }],
      });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((log) => {
          try { return registry.interface.parseLog(log as any); } catch { return null; }
        })
        .find((e) => e?.name === "VaultDeployed");

      const safeAddr = event!.args.safe;
      const kmAddr = event!.args.keyManager;
      const peAddr = event!.args.policyEngine;

      const safe = await ethers.getContractAt("AgentSafe", safeAddr);
      const km = await ethers.getContractAt("LSP6KeyManager", kmAddr);
      const pe = await ethers.getContractAt("PolicyEngine", peAddr);
      const policies = await pe.getPolicies();

      // AgentSafe, PolicyEngine, and deployed policies all use LSP14 two-step ownership.
      // The registry remains owner until the user accepts on each contract.

      // Before acceptOwnership: pendingOwner is set, registry is still owner of Safe
      const pendingOwner = await (safe as any).pendingOwner();
      expect(pendingOwner).to.equal(owner.address);

      expect(await (pe as any).pendingOwner()).to.equal(owner.address);
      expect(await (pe as any).owner()).to.equal(await registry.getAddress());
      for (const policyAddr of policies) {
        const policy = await ethers.getContractAt("BudgetPolicy", policyAddr);
        expect(await (policy as any).pendingOwner()).to.equal(owner.address);
      }

      // Finalize ownership for the full stack.
      await safe.connect(owner).acceptOwnership();
      await pe.connect(owner).acceptOwnership();
      for (const policyAddr of policies) {
        const policy = await ethers.getContractAt("BudgetPolicy", policyAddr);
        await (policy as any).connect(owner).acceptOwnership();
        expect(await (policy as any).owner()).to.equal(owner.address);
      }

      expect(await (safe as any).owner()).to.equal(owner.address);
      expect(await (pe as any).owner()).to.equal(owner.address);

      // Fund safe
      await owner.sendTransaction({ to: safeAddr, value: ethers.parseEther("10") });

      // Agent can still use the vault normally after ownership transfer
      const safeIface = (await ethers.getContractAt("AgentSafe", safeAddr)).interface;
      const calldata = safeIface.encodeFunctionData("execute", [
        0, merchant.address, ethers.parseEther("1"), "0x",
      ]);
      await expect(km.connect(agent).execute(calldata)).to.not.be.reverted;
    });

    it("non-pending owner cannot call acceptOwnership", async function () {
      const tx = await deployVault();
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((log) => {
          try { return registry.interface.parseLog(log as any); } catch { return null; }
        })
        .find((e) => e?.name === "VaultDeployed");

      const safe = await ethers.getContractAt("AgentSafe", event!.args.safe);
      // agent is not pendingOwner — should revert
      await expect(safe.connect(agent).acceptOwnership()).to.be.reverted;
    });
  });

  describe("Full integration: deploy → fund → agent pays → budget tracked", function () {
    let safe: AgentSafe;
    let km: LSP6KeyManager;
    let budgetPolicyAddr: string;

    beforeEach(async function () {
      // Deploy vault with merchant whitelist and weekly budget
      const tx = await deployVault({
        merchants: [merchant.address],
        budget: BUDGET,
        period: 1, // WEEKLY
        agentMode:           AgentMode.STRICT_PAYMENTS,
        allowedCallsByAgent: [{ agent: agent.address, allowedCalls: encodeAllowedCalls([merchant.address]) }],
      });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((log) => {
          try { return registry.interface.parseLog(log as any); } catch { return null; }
        })
        .find((e) => e?.name === "VaultDeployed");

      const safeAddr = event!.args.safe;
      const kmAddr = event!.args.keyManager;

      safe = await ethers.getContractAt("AgentSafe", safeAddr) as AgentSafe;
      km = await ethers.getContractAt("LSP6KeyManager", kmAddr) as LSP6KeyManager;

      // Owner must accept ownership (LSP14 two-step)
      await safe.connect(owner).acceptOwnership();

      // Fund the safe with LYX
      await owner.sendTransaction({
        to: await safe.getAddress(),
        value: BUDGET,
      });

      // Get BudgetPolicy address from PolicyEngine
      const peAddr = event!.args.policyEngine;
      const pe = await ethers.getContractAt("PolicyEngine", peAddr);
      const policies = await pe.getPolicies();
      budgetPolicyAddr = policies[0]; // BudgetPolicy is always first
    });

    it("agent can pay via KM.execute → ERC725X.execute → PolicyEngine", async function () {
      const merchantBefore = await ethers.provider.getBalance(merchant.address);

      // Agent calls KM.execute with ERC725X.execute payload (standard LUKSO agent call path)
      // KM forwards to safe.execute(0, merchant, amount, "")
      // AgentSafe.execute() override validates policies then calls _execute()
      const safeInterface = safe.interface;
      const executeCalldata = safeInterface.encodeFunctionData("execute", [
        0,                          // CALL operation
        merchant.address,           // to
        ethers.parseEther("50"),    // value
        "0x",                       // data (empty = pure LYX transfer)
      ]);
      await km.connect(agent).execute(executeCalldata);

      const merchantAfter = await ethers.provider.getBalance(merchant.address);
      expect(merchantAfter - merchantBefore).to.equal(ethers.parseEther("50"));
    });

    it("budget is updated after agent payment via KM", async function () {
      const safeInterface = safe.interface;
      const executeCalldata = safeInterface.encodeFunctionData("execute", [
        0,
        merchant.address,
        ethers.parseEther("50"),
        "0x",
      ]);
      await km.connect(agent).execute(executeCalldata);

      const budgetPolicy = await ethers.getContractAt("BudgetPolicy", budgetPolicyAddr) as BudgetPolicy;
      expect(await budgetPolicy.spent()).to.equal(ethers.parseEther("50"));
    });

    it("agent cannot pay non-whitelisted merchant via KM", async function () {
      const [, , , nonMerchant] = await ethers.getSigners();
      const safeInterface = safe.interface;
      const executeCalldata = safeInterface.encodeFunctionData("execute", [
        0,
        nonMerchant.address,
        ethers.parseEther("1"),
        "0x",
      ]);
      await expect(km.connect(agent).execute(executeCalldata)).to.be.reverted;
    });

    it("agent cannot exceed budget via KM", async function () {
      const safeInterface = safe.interface;
      const executeCalldata = safeInterface.encodeFunctionData("execute", [
        0,
        merchant.address,
        ethers.parseEther("201"),
        "0x",
      ]);
      await expect(km.connect(agent).execute(executeCalldata)).to.be.reverted;
    });
  });

  // ─── ERC725Y storage — setData → getData roundtrip ────────────────────────
  //
  // These tests verify that permission keys written by AgentVaultRegistry._deployStack
  // are actually persisted in the AgentSafe's ERC725Y storage and can be read back
  // with the correct canonical LSP6 key derivation.
  //
  // Failure here means the write target, key construction, or encoding is wrong —
  // even if the deployment tx succeeded and events were emitted.

  describe("ERC725Y storage — permissions roundtrip", function () {
    let safe: AgentSafe;
    let safeAddr: string;

    beforeEach(async function () {
      const tx = await registry.connect(owner).deployVault({
        budget: BUDGET,
        period: 1,
        budgetToken: ethers.ZeroAddress,
        expiration: 0,
        agents: [agent.address],
        agentBudgets: [],
        merchants: [],
        recipientConfigs: [],
        label: "Perm Test Vault",
        // OPS_ADMIN: SETDATA only, no AllowedCalls required
        agentMode:              AgentMode.OPS_ADMIN,
        allowSuperPermissions:  false,
        customAgentPermissions: ethers.ZeroHash,
        allowedCallsByAgent:    [],
        multisigSigners:        [],
        multisigThreshold:      0,
        multisigTimeLock:       0,
      });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((log) => {
          try { return registry.interface.parseLog(log as any); } catch { return null; }
        })
        .find((e) => e?.name === "VaultDeployed");

      safeAddr = event!.args.safe;
      safe = await ethers.getContractAt("AgentSafe", safeAddr) as AgentSafe;
    });

    it("AddressPermissions[] length is 2 (owner + 1 agent)", async function () {
      const raw = await safe.getData(AP_ARRAY_KEY);
      expect(decodeArrayLength(raw)).to.equal(2);
    });

    it("AddressPermissions[0] stores the owner address", async function () {
      const raw = await safe.getData(apArrayElementKey(0));
      const stored = decodeControllerAddress(raw);
      expect(stored.toLowerCase()).to.equal(owner.address.toLowerCase());
    });

    it("AddressPermissions[1] stores the agent address", async function () {
      const raw = await safe.getData(apArrayElementKey(1));
      const stored = decodeControllerAddress(raw);
      expect(stored.toLowerCase()).to.equal(agent.address.toLowerCase());
    });

    it("owner has SUPER permissions (all bits set)", async function () {
      const raw = await safe.getData(apPermissionsKey(owner.address));
      // Permissions stored as bytes32(type(uint256).max) — must round-trip exactly.
      expect(raw.toLowerCase()).to.equal(SUPER_PERM.toLowerCase());
    });

    it("agent has OPS_ADMIN permissions (SETDATA only = 0x40000)", async function () {
      const raw = await safe.getData(apPermissionsKey(agent.address));
      expect(decodePermissions(raw)).to.equal(BigInt(PERM_OPS_ADMIN));
    });

    it("unknown address has no permissions", async function () {
      const [, , , stranger] = await ethers.getSigners();
      const raw = await safe.getData(apPermissionsKey(stranger.address));
      expect(decodePermissions(raw)).to.equal(0n);
    });

    it("AddressPermissions[] length grows when deploying with multiple agents", async function () {
      const [, , , agentB, agentC] = await ethers.getSigners();
      const tx = await registry.connect(owner).deployVault({
        budget: BUDGET,
        period: 1,
        budgetToken: ethers.ZeroAddress,
        expiration: 0,
        agents: [agentB.address, agentC.address],
        agentBudgets: [],
        merchants: [],
        recipientConfigs: [],
        label: "Multi-agent Vault",
        // OPS_ADMIN: no AllowedCalls needed, just verify array storage
        agentMode:              AgentMode.OPS_ADMIN,
        allowSuperPermissions:  false,
        customAgentPermissions: ethers.ZeroHash,
        allowedCallsByAgent:    [],
        multisigSigners:        [],
        multisigThreshold:      0,
        multisigTimeLock:       0,
      });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((log) => {
          try { return registry.interface.parseLog(log as any); } catch { return null; }
        })
        .find((e) => e?.name === "VaultDeployed");
      const multiSafe = await ethers.getContractAt("AgentSafe", event!.args.safe) as AgentSafe;

      const raw = await multiSafe.getData(AP_ARRAY_KEY);
      // owner + agentB + agentC = 3
      expect(decodeArrayLength(raw)).to.equal(3);
    });

    it("element key at index 0 is NOT the length key (guard against off-by-one key confusion)", async function () {
      // AP_ARRAY_KEY (length) and apArrayElementKey(0) (first element) must be different.
      expect(AP_ARRAY_KEY.toLowerCase()).to.not.equal(apArrayElementKey(0).toLowerCase());

      // Reading element[0] must NOT return the same bytes as the length slot.
      const lengthRaw = await safe.getData(AP_ARRAY_KEY);
      const elem0Raw  = await safe.getData(apArrayElementKey(0));
      expect(elem0Raw.toLowerCase()).to.not.equal(lengthRaw.toLowerCase());
    });
  });

  // ─── MultisigController deployment via registry ────────────────────────────
  //
  // Verifies that deploying a vault with multisigSigners properly:
  //   (a) deploys the MultisigController and records it in mappings + VaultRecord
  //   (b) writes AVP:MultisigController in ERC725Y storage
  //   (c) grants the controller PERM_STRICT (CALL|TRANSFERVALUE) LSP6 permissions
  //   (d) the controller can execute approved proposals end-to-end

  describe("MultisigController deployment via registry", function () {
    const AVP_MULTISIG = ethers.keccak256(ethers.toUtf8Bytes("AVP:MultisigController"));

    let safeMs: AgentSafe;
    let kmMs: LSP6KeyManager;
    let multisigAddr: string;
    let signer1: SignerWithAddress;
    let signer2: SignerWithAddress;
    let safeAddrMs: string;

    beforeEach(async function () {
      [, , , signer1, signer2] = await ethers.getSigners();

      const tx = await deployVault({
        agents: [],              // no standard agents — only multisig
        multisigSigners: [signer1.address, signer2.address],
        multisigThreshold: 1,  // threshold=1 lets a single signer propose + execute
        multisigTimeLock: 0,
      });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((log) => {
          try { return registry.interface.parseLog(log as any); } catch { return null; }
        })
        .find((e) => e?.name === "VaultDeployed");

      safeAddrMs = event!.args.safe;
      const kmAddr = event!.args.keyManager;
      safeMs = await ethers.getContractAt("AgentSafe", safeAddrMs) as AgentSafe;
      kmMs   = await ethers.getContractAt("LSP6KeyManager", kmAddr) as LSP6KeyManager;
      multisigAddr = await registry.safeToMultisigController(safeAddrMs);
    });

    it("safeToMultisigController mapping is populated", async function () {
      expect(multisigAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("VaultRecord.multisigController matches mapping", async function () {
      const [record] = await registry.getVaults(owner.address);
      expect(record.multisigController.toLowerCase()).to.equal(multisigAddr.toLowerCase());
    });

    it("AVP:MultisigController ERC725Y key stores the deployed address", async function () {
      const raw = await safeMs.getData(AVP_MULTISIG);
      const [decoded] = ethers.AbiCoder.defaultAbiCoder().decode(["address"], raw);
      expect(decoded.toLowerCase()).to.equal(multisigAddr.toLowerCase());
    });

    it("MultisigController has PERM_POWER_USER (SUPER_CALL|SUPER_TRANSFERVALUE = 0x500) in AddressPermissions", async function () {
      // LUKSO LSP6 blocks all calls when AllowedCalls is empty but CALL is set
      // without SUPER_CALL (NoCallsAllowed). SUPER_* is required so the multisig
      // can call any target; the M-of-N flow + PolicyEngine enforce spend limits.
      const raw = await safeMs.getData(apPermissionsKey(multisigAddr));
      expect(decodePermissions(raw)).to.equal(BigInt("0x500"));
    });

    it("AddressPermissions[] length is 2 (owner + multisig) when agents=[]", async function () {
      const raw = await safeMs.getData(AP_ARRAY_KEY);
      expect(decodeArrayLength(raw)).to.equal(2);
    });

    it("getPendingContracts does NOT include multisigController (it has no LSP14)", async function () {
      const [contracts] = await registry.connect(owner).getPendingContracts(safeAddrMs);
      const hasMs = contracts.some(
        (c) => c.toLowerCase() === multisigAddr.toLowerCase()
      );
      expect(hasMs).to.equal(false);
    });

    it("multisig executes an approved proposal end-to-end", async function () {
      // Finalize LSP14 ownership so safe is fully operational.
      await safeMs.connect(owner).acceptOwnership();
      const peAddr = await registry.safeToPolicyEngine(safeAddrMs);
      const pe = await ethers.getContractAt("PolicyEngine", peAddr);
      await pe.connect(owner).acceptOwnership();
      // Accept BudgetPolicy ownership too
      const policies = await pe.getPolicies();
      for (const pAddr of policies) {
        const p = await ethers.getContractAt("BudgetPolicy", pAddr);
        await (p as any).connect(owner).acceptOwnership();
      }

      // Fund the safe
      await owner.sendTransaction({ to: safeAddrMs, value: ethers.parseEther("10") });

      const balBefore = await ethers.provider.getBalance(merchant.address);

      const ms = await ethers.getContractAt("MultisigController", multisigAddr);

      // Propose: signer1 want to send 1 ETH to merchant.
      // target = merchant (direct ETH transfer), value = 1 ETH, data = "0x"
      const proposeTx = await ms.connect(signer1).propose(
        merchant.address,
        ethers.parseEther("1"),
        "0x",
        0,  // no deadline
        0,  // no per-proposal timelock
        1,  // ANY_SIGNER executor mode
      );
      const propReceipt = await proposeTx.wait();
      const propEvent = propReceipt!.logs
        .map((l: any) => { try { return ms.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "Proposed");
      const proposalId = propEvent!.args.id as string;

      // threshold=1 so proposer auto-approval is sufficient — execute immediately.
      await ms.connect(signer1).execute(proposalId);

      const balAfter = await ethers.provider.getBalance(merchant.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("1"));
    });
  });

  describe("enableMultisig", function () {
    const AVP_MULTISIG = ethers.keccak256(ethers.toUtf8Bytes("AVP:MultisigController"));

    let safeAddr: string;
    let safe: AgentSafe;
    let signer1: SignerWithAddress;
    let signer2: SignerWithAddress;

    beforeEach(async function () {
      [, , , signer1, signer2] = await ethers.getSigners();

      const tx = await deployVault({ agents: [] });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((log) => {
          try { return registry.interface.parseLog(log as any); } catch { return null; }
        })
        .find((e) => e?.name === "VaultDeployed");

      safeAddr = event!.args.safe;
      safe = await ethers.getContractAt("AgentSafe", safeAddr) as AgentSafe;
    });

    it("installs multisig for a pending-owner vault and updates registry metadata", async function () {
      await expect(
        registry.connect(owner).enableMultisig(safeAddr, [signer1.address, signer2.address], 2, 3600)
      ).to.emit(registry, "MultisigEnabled");

      const multisigAddr = await registry.safeToMultisigController(safeAddr);
      expect(multisigAddr).to.not.equal(ethers.ZeroAddress);

      const [record] = await registry.getVaults(owner.address);
      expect(record.multisigController.toLowerCase()).to.equal(multisigAddr.toLowerCase());

      const raw = await safe.getData(AVP_MULTISIG);
      const [decoded] = ethers.AbiCoder.defaultAbiCoder().decode(["address"], raw);
      expect(decoded.toLowerCase()).to.equal(multisigAddr.toLowerCase());

      const permsRaw = await safe.getData(apPermissionsKey(multisigAddr));
      expect(decodePermissions(permsRaw)).to.equal(BigInt("0x500"));

      const apLenRaw = await safe.getData(AP_ARRAY_KEY);
      expect(decodeArrayLength(apLenRaw)).to.equal(2);
    });

    it("rejects callers other than the designated owner", async function () {
      await expect(
        registry.connect(agent).enableMultisig(safeAddr, [signer1.address], 1, 0)
      ).to.be.revertedWith("Registry: not designated owner");
    });

    it("rejects installation after the safe ownership was already accepted", async function () {
      await safe.connect(owner).acceptOwnership();

      await expect(
        registry.connect(owner).enableMultisig(safeAddr, [signer1.address], 1, 0)
      ).to.be.revertedWith("Registry: safe already accepted");
    });

    it("rejects duplicate multisig installation", async function () {
      await registry.connect(owner).enableMultisig(safeAddr, [signer1.address], 1, 0);

      await expect(
        registry.connect(owner).enableMultisig(safeAddr, [signer2.address], 1, 0)
      ).to.be.revertedWith("Registry: multisig already set");
    });
  });

  // ─── MultisigController — security invariants (registry-integrated) ──────────
  //
  // Since SUPER_CALL bypasses LSP6 AllowedCalls, the security boundary moved from
  // LSP6 into the multisig's internal logic. These tests verify those invariants
  // are actually enforced on-chain and cannot be bypassed.
  //
  // Inv-1: Quorum     — execute() is blocked below threshold (no quorum bypass)
  // Inv-2: Timelock   — execute() is gated by the time delay (not eludible)
  // Inv-3: PolicyEngine — budget ceiling applies even to multisig proposals
  // Inv-4: Signer governance — signer rotation requires an approved selfCall proposal

  describe("MultisigController — security invariants", function () {

    // Deploys a registry-integrated multisig vault and returns {safeAddr, ms}.
    async function deployMsVault(opts: {
      inv_signer1: SignerWithAddress;
      inv_signer2?: SignerWithAddress;
      threshold: number;
      timeLock?: number;
      budget?: bigint;
      withMerchant?: boolean;
    }) {
      const tx = await deployVault({
        agents: [],
        budget: opts.budget ?? BUDGET,
        merchants: opts.withMerchant ? [merchant.address] : [],
        multisigSigners: opts.inv_signer2
          ? [opts.inv_signer1.address, opts.inv_signer2.address]
          : [opts.inv_signer1.address],
        multisigThreshold: opts.threshold,
        multisigTimeLock: opts.timeLock ?? 0,
      });
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((l: any) => { try { return registry.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "VaultDeployed");
      const safeAddr = event!.args.safe as string;
      const msAddr = await registry.safeToMultisigController(safeAddr);
      const ms = await ethers.getContractAt("MultisigController", msAddr);
      return { safeAddr, ms };
    }

    // Accepts all pending LSP14 ownership transfers and funds the safe with ETH.
    async function acceptAndFund(safeAddr: string, value = ethers.parseEther("10")) {
      const safe = await ethers.getContractAt("AgentSafe", safeAddr);
      await safe.connect(owner).acceptOwnership();
      const peAddr = await registry.safeToPolicyEngine(safeAddr);
      const pe = await ethers.getContractAt("PolicyEngine", peAddr);
      await pe.connect(owner).acceptOwnership();
      for (const pAddr of await pe.getPolicies()) {
        const pol = await ethers.getContractAt("BudgetPolicy", pAddr);
        await (pol as any).connect(owner).acceptOwnership();
      }
      await owner.sendTransaction({ to: safeAddr, value });
    }

    // Proposes a payment and returns the proposal id.
    async function invPropose(
      ms: any,
      proposer: SignerWithAddress,
      target: string,
      value: bigint,
      timelockOverride = 0,
    ) {
      const tx = await ms.connect(proposer).propose(
        target, value, "0x",
        0,              // no deadline
        timelockOverride,
        1,              // ANY_SIGNER executor mode
      );
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((l: any) => { try { return ms.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "Proposed");
      return event!.args.id as string;
    }

    // ── Inv-1: Quorum ─────────────────────────────────────────────────────────

    it("Inv-1: execute() reverts QuorumNotReached when approval count is below threshold", async function () {
      const [, , , inv_signer1, inv_signer2] = await ethers.getSigners();
      const { safeAddr, ms } = await deployMsVault({ inv_signer1, inv_signer2, threshold: 2 });
      await acceptAndFund(safeAddr);
      const proposalId = await invPropose(ms, inv_signer1, merchant.address, ethers.parseEther("0.1"));
      // Only inv_signer1 has approved (auto-approval on propose). inv_signer2 has not.
      await expect(ms.connect(inv_signer1).execute(proposalId))
        .to.be.revertedWithCustomError(ms, "QuorumNotReached");
    });

    it("Inv-1b: execute() succeeds once second signer approves (quorum reached)", async function () {
      const [, , , inv_signer1, inv_signer2] = await ethers.getSigners();
      const { safeAddr, ms } = await deployMsVault({
        inv_signer1, inv_signer2, threshold: 2, withMerchant: true,
      });
      await acceptAndFund(safeAddr);
      const proposalId = await invPropose(ms, inv_signer1, merchant.address, ethers.parseEther("0.1"));
      await ms.connect(inv_signer2).approve(proposalId);
      const balBefore = await ethers.provider.getBalance(merchant.address);
      await ms.connect(inv_signer1).execute(proposalId);
      const balAfter = await ethers.provider.getBalance(merchant.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("0.1"));
    });

    // ── Inv-2: Timelock ───────────────────────────────────────────────────────

    it("Inv-2: execute() reverts TimelockPending before the global timeLock elapses", async function () {
      const [, , , inv_signer1] = await ethers.getSigners();
      const { safeAddr, ms } = await deployMsVault({ inv_signer1, threshold: 1, timeLock: 3600 });
      await acceptAndFund(safeAddr);
      const proposalId = await invPropose(ms, inv_signer1, merchant.address, ethers.parseEther("0.1"));
      // Quorum met (threshold=1), but timelock has not elapsed yet.
      await expect(ms.connect(inv_signer1).execute(proposalId))
        .to.be.revertedWithCustomError(ms, "TimelockPending");
    });

    it("Inv-2b: execute() succeeds after evm_increaseTime past the timeLock", async function () {
      const [, , , inv_signer1] = await ethers.getSigners();
      const { safeAddr, ms } = await deployMsVault({
        inv_signer1, threshold: 1, timeLock: 3600, withMerchant: true,
      });
      await acceptAndFund(safeAddr);
      const proposalId = await invPropose(ms, inv_signer1, merchant.address, ethers.parseEther("0.1"));
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      const balBefore = await ethers.provider.getBalance(merchant.address);
      await ms.connect(inv_signer1).execute(proposalId);
      const balAfter = await ethers.provider.getBalance(merchant.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("0.1"));
    });

    // ── Inv-3: PolicyEngine ───────────────────────────────────────────────────

    it("Inv-3: execute() reverts when proposed amount exceeds PolicyEngine budget cap", async function () {
      const [, , , inv_signer1] = await ethers.getSigners();
      const { safeAddr, ms } = await deployMsVault({
        inv_signer1, threshold: 1,
        budget: ethers.parseEther("1"), withMerchant: true,
      });
      await acceptAndFund(safeAddr);
      // 2 ETH — exceeds the 1 ETH budget cap.
      const proposalId = await invPropose(ms, inv_signer1, merchant.address, ethers.parseEther("2"));
      await expect(ms.connect(inv_signer1).execute(proposalId)).to.be.reverted;
    });

    it("Inv-3b: first payment within budget succeeds; second that exceeds cumulative cap reverts", async function () {
      const [, , , inv_signer1] = await ethers.getSigners();
      const { safeAddr, ms } = await deployMsVault({
        inv_signer1, threshold: 1,
        budget: ethers.parseEther("1"), withMerchant: true,
      });
      await acceptAndFund(safeAddr);
      const id1 = await invPropose(ms, inv_signer1, merchant.address, ethers.parseEther("0.5"));
      await ms.connect(inv_signer1).execute(id1); // 0.5 < 1 → passes
      const id2 = await invPropose(ms, inv_signer1, merchant.address, ethers.parseEther("0.6"));
      await expect(ms.connect(inv_signer1).execute(id2)).to.be.reverted; // 0.5+0.6=1.1 > 1 → fails
    });

    // ── Inv-4: Signer governance ──────────────────────────────────────────────

    it("Inv-4: updateSigners() reverts OnlySelf when called directly", async function () {
      const [, , , inv_signer1, inv_signer2] = await ethers.getSigners();
      const { ms } = await deployMsVault({ inv_signer1, threshold: 1 });
      await expect(
        ms.connect(inv_signer1).updateSigners([inv_signer2.address], 1),
      ).to.be.revertedWithCustomError(ms, "OnlySelf");
    });

    it("Inv-4b: signer rotation succeeds via selfCall proposal (threshold=1, no timelock)", async function () {
      // Call chain: propose(msAddr, 0, selfCallData) → execute()
      //   → Vault.execute(ms, selfCallData) → ms.selfCall(updateSignersData)
      //     → address(ms).call(updateSignersData) → ms.updateSigners(...)
      // This is the only valid path to rotate signers post-deployment.
      const [, , , inv_signer1, inv_signer2] = await ethers.getSigners();
      const { safeAddr, ms } = await deployMsVault({ inv_signer1, threshold: 1 });
      await acceptAndFund(safeAddr);
      const msAddr = await ms.getAddress();

      const updateSignersCalldata = ms.interface.encodeFunctionData("updateSigners", [
        [inv_signer2.address], 1,
      ]);
      const selfCallData = ms.interface.encodeFunctionData("selfCall", [updateSignersCalldata]);

      // Propose targeting the MS with selfCall(updateSigners(...))
      const tx = await ms.connect(inv_signer1).propose(
        msAddr, 0n, selfCallData, 0, 0, 1,
      );
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((l: any) => { try { return ms.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "Proposed");
      const proposalId = event!.args.id as string;

      // Execute — quorum met (threshold=1, auto-approved), no timelock.
      await ms.connect(inv_signer1).execute(proposalId);

      // Signer set has been rotated: inv_signer2 is now the sole signer.
      expect(await ms.isSigner(inv_signer2.address)).to.be.true;
      expect(await ms.isSigner(inv_signer1.address)).to.be.false;
      expect(await ms.threshold()).to.equal(1n);
    });

  });
});
