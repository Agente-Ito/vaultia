import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  AgentVaultRegistry,
  AgentSafe,
  LSP6KeyManager,
  BudgetPolicy,
  MerchantPolicy,
} from "../typechain-types";

describe("AgentVaultRegistry — Integration", function () {
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let merchant: SignerWithAddress;
  let registry: AgentVaultRegistry;

  const BUDGET = ethers.parseEther("200");

  beforeEach(async function () {
    [owner, agent, merchant] = await ethers.getSigners();
    const RegistryFactory = await ethers.getContractFactory("AgentVaultRegistry");
    registry = await RegistryFactory.deploy();
  });

  async function deployVault(params?: Partial<{
    budget: bigint;
    period: number;
    budgetToken: string;
    expiration: number;
    agents: string[];
    agentBudgets: bigint[];
    merchants: string[];
    label: string;
  }>) {
    const p = {
      budget: BUDGET,
      period: 1, // WEEKLY
      budgetToken: ethers.ZeroAddress,
      expiration: 0,
      agents: [agent.address],
      agentBudgets: [], // No per-agent budgets by default
      merchants: params?.merchants ?? [],
      label: "Test Vault",
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
    it("full flow: deployVault → acceptOwnership on safe and policyEngine → agent still works", async function () {
      const tx = await deployVault({ merchants: [merchant.address] });
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

      // AgentSafe uses LSP14 two-step (extends LSP9Vault → LSP14Ownable2Step).
      // PolicyEngine uses OZ Ownable (single-step, no acceptOwnership needed).
      // Registry already transferred PE ownership directly via transferOwnership().

      // Before acceptOwnership: pendingOwner is set, registry is still owner of Safe
      const pendingOwner = await (safe as any).pendingOwner();
      expect(pendingOwner).to.equal(owner.address);

      // PolicyEngine: OZ Ownable — ownership already transferred, owner is the user
      expect(await (pe as any).owner()).to.equal(owner.address);

      // Safe: LSP14 — user must accept to become owner
      await safe.connect(owner).acceptOwnership();
      expect(await (safe as any).owner()).to.equal(owner.address);

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
});
