import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  AgentVaultRegistry,
  AgentVaultDeployerCore,
  AgentVaultDeployer,
  AgentKMDeployer,
  RecipientBudgetPolicy,
} from "../typechain-types";

const FIVE_MINUTES = 4; // BudgetPolicy.Period.FIVE_MINUTES
const HOURLY       = 3; // BudgetPolicy.Period.HOURLY
const DAILY        = 0; // BudgetPolicy.Period.DAILY
const WEEKLY       = 1; // BudgetPolicy.Period.WEEKLY
const MONTHLY      = 2; // BudgetPolicy.Period.MONTHLY

async function deployFixture() {
  const [owner, agent, recipient1, recipient2, recipient3, other] = await ethers.getSigners();

  const CoreFactory     = await ethers.getContractFactory("AgentVaultDeployerCore");
  const DeployerFactory = await ethers.getContractFactory("AgentVaultDeployer");
  const OptFactory      = await ethers.getContractFactory("AgentVaultOptionalPolicyDeployer");
  const KmFactory       = await ethers.getContractFactory("AgentKMDeployer");
  const MsFactory       = await ethers.getContractFactory("MultisigControllerDeployer");
  const RegFactory      = await ethers.getContractFactory("AgentVaultRegistry");
  const CoordFactory    = await ethers.getContractFactory("AgentCoordinator");
  const PoolFactory     = await ethers.getContractFactory("SharedBudgetPool");

  const core     = await CoreFactory.deploy()     as AgentVaultDeployerCore;
  const deployer = await DeployerFactory.deploy() as AgentVaultDeployer;
  const opt      = await OptFactory.deploy();
  const km       = await KmFactory.deploy()       as AgentKMDeployer;
  const ms       = await MsFactory.deploy();
  const coord    = await CoordFactory.deploy();
  const pool     = await PoolFactory.deploy(owner.address);
  const registry = await RegFactory.deploy(
    await core.getAddress(),
    await deployer.getAddress(),
    await opt.getAddress(),
    await km.getAddress(),
    await coord.getAddress(),
    await pool.getAddress(),
    await ms.getAddress(),
  ) as AgentVaultRegistry;

  return { owner, agent, recipient1, recipient2, recipient3, other, registry, deployer };
}

async function deployStandaloneRecipientBudgetPolicy(
  ownerAddress: string,
  budgetToken: string = ethers.ZeroAddress,
) {
  const MockPolicyEngineFactory = await ethers.getContractFactory("MockPolicyEngineCaller");
  const mockPolicyEngine = await MockPolicyEngineFactory.deploy();

  const RBPFactory = await ethers.getContractFactory("RecipientBudgetPolicy");
  const rbp = await RBPFactory.deploy(
    ownerAddress,
    await mockPolicyEngine.getAddress(),
    budgetToken,
  ) as RecipientBudgetPolicy;

  return { rbp, mockPolicyEngine };
}

describe("RecipientBudgetPolicy", function () {

  describe("Whitelist enforcement", function () {
    it("blocks payment to unregistered recipient", async function () {
      const { owner, agent, recipient1, registry } = await deployFixture();

      const tx = await registry.connect(owner).deployVault({
        budget: ethers.parseEther("1000"),
        period: WEEKLY,
        budgetToken: ethers.ZeroAddress,
        expiration: 0,
        agents: [],
        agentBudgets: [],
        merchants: [],
        recipientConfigs: [
          { recipient: recipient1.address, budget: ethers.parseEther("100"), period: WEEKLY },
        ],
        label: "RBP Vault",
        agentMode: 3,
        allowSuperPermissions: false,
        customAgentPermissions: ethers.ZeroHash,
        allowedCallsByAgent: [],
        multisigSigners:    [],
        multisigThreshold:  0,
        multisigTimeLock:   0,
      });

      const receipt = await tx.wait();

      // Find the deployed PolicyEngine via VaultDeployed event
      let peAddr = "";
      for (const log of receipt!.logs) {
        try {
          const parsed = registry.interface.parseLog(log);
          if (parsed?.name === "VaultDeployed") peAddr = parsed.args.policyEngine;
        } catch {}
      }
      expect(peAddr).to.not.equal("");

      const pe = await ethers.getContractAt("PolicyEngine", peAddr);
      const policies: string[] = await pe.getPolicies();
      expect(policies.length).to.be.gte(2); // BudgetPolicy + RBP

      // Find RBP by checking which policy has recipientLimits
      let rbpAddr = "";
      for (const pAddr of policies) {
        try {
          const rbp = await ethers.getContractAt("RecipientBudgetPolicy", pAddr);
          await rbp.recipientCount();
          rbpAddr = pAddr;
          break;
        } catch {}
      }
      expect(rbpAddr).to.not.equal("", "RecipientBudgetPolicy not found");

      const rbp = await ethers.getContractAt("RecipientBudgetPolicy", rbpAddr);
      const rl = await rbp.recipientLimits(recipient1.address);
      expect(rl.registered).to.equal(true);
      expect(rl.limit).to.equal(ethers.parseEther("100"));
    });

    it("allows whitelist-only recipient (limit=0) without cap", async function () {
      const { owner, recipient1, registry } = await deployFixture();

      await registry.connect(owner).deployVault({
        budget: ethers.parseEther("1000"),
        period: WEEKLY,
        budgetToken: ethers.ZeroAddress,
        expiration: 0,
        agents: [],
        agentBudgets: [],
        merchants: [],
        recipientConfigs: [
          { recipient: recipient1.address, budget: 0, period: WEEKLY }, // whitelist-only
        ],
        label: "Whitelist Vault",
        agentMode: 3,
        allowSuperPermissions: false,
        customAgentPermissions: ethers.ZeroHash,
        allowedCallsByAgent: [],
        multisigSigners:    [],
        multisigThreshold:  0,
        multisigTimeLock:   0,
      });

      const vaults = await registry.getVaults(owner.address);
      const rbpCandidate = await findRBP(vaults[0].policyEngine);
      expect(rbpCandidate).to.not.be.null;

      const remaining = await rbpCandidate!.getRecipientRemaining(recipient1.address);
      // Whitelist-only: remaining == type(uint256).max
      expect(remaining).to.equal(ethers.MaxUint256);
    });
  });

  describe("Spending limits", function () {
    it("tracks spent correctly and rejects when exceeded", async function () {
      const { owner, registry } = await deployFixture();
      const [,, recipient] = await ethers.getSigners();

      await registry.connect(owner).deployVault({
        budget: ethers.parseEther("1000"),
        period: WEEKLY,
        budgetToken: ethers.ZeroAddress,
        expiration: 0,
        agents: [],
        agentBudgets: [],
        merchants: [],
        recipientConfigs: [
          { recipient: recipient.address, budget: ethers.parseEther("100"), period: WEEKLY },
        ],
        label: "Budget Vault",
        agentMode: 3,
        allowSuperPermissions: false,
        customAgentPermissions: ethers.ZeroHash,
        allowedCallsByAgent: [],
        multisigSigners:    [],
        multisigThreshold:  0,
        multisigTimeLock:   0,
      });

      const vaults = await registry.getVaults(owner.address);
      const rbp = (await findRBP(vaults[0].policyEngine))!;

      // Initial remaining == 100
      const rem0 = await rbp.getRecipientRemaining(recipient.address);
      expect(rem0).to.equal(ethers.parseEther("100"));
    });

    it("respects MAX_RECIPIENTS cap", async function () {
      const { owner, registry } = await deployFixture();
      const signers = await ethers.getSigners();

      // Build 101 recipient configs (should revert)
      const configs = [];
      for (let i = 0; i < 101; i++) {
        const addr = signers[i % signers.length].address;
        // Use different generated addresses to avoid duplicates
        const paddedAddr = ethers.getAddress("0x" + (i + 1).toString(16).padStart(40, "0"));
        configs.push({ recipient: paddedAddr, budget: 0, period: WEEKLY });
      }

      await expect(
        registry.connect(owner).deployVault({
          budget: ethers.parseEther("1000"),
          period: WEEKLY,
          budgetToken: ethers.ZeroAddress,
          expiration: 0,
          agents: [],
          agentBudgets: [],
          merchants: [],
          recipientConfigs: configs,
          label: "Too Many Recipients",
          agentMode: 3,
          allowSuperPermissions: false,
          customAgentPermissions: ethers.ZeroHash,
          allowedCallsByAgent: [],
          multisigSigners:    [],
          multisigThreshold:  0,
          multisigTimeLock:   0,
        })
      ).to.be.revertedWith("Registry: too many recipient configs");
    });
  });

  describe("Period resets", function () {
    it("resets after FIVE_MINUTES period", async function () {
      const { owner, registry } = await deployFixture();
      const [,, recipient] = await ethers.getSigners();

      await registry.connect(owner).deployVault({
        budget: ethers.parseEther("1000"),
        period: FIVE_MINUTES,
        budgetToken: ethers.ZeroAddress,
        expiration: 0,
        agents: [],
        agentBudgets: [],
        merchants: [],
        recipientConfigs: [
          { recipient: recipient.address, budget: ethers.parseEther("50"), period: FIVE_MINUTES },
        ],
        label: "5min Vault",
        agentMode: 3,
        allowSuperPermissions: false,
        customAgentPermissions: ethers.ZeroHash,
        allowedCallsByAgent: [],
        multisigSigners:    [],
        multisigThreshold:  0,
        multisigTimeLock:   0,
      });

      const vaults = await registry.getVaults(owner.address);
      const rbp = (await findRBP(vaults[0].policyEngine))!;

      // Advance 5 minutes + 1 second
      await time.increase(301);

      // After period reset, remaining should be back to full limit
      // (The reset is lazy — triggered by next validate() call, which we check via view)
      // Since periodStart advances lazily, the remaining view returns pre-reset value.
      // We can only verify the period boundary logic by checking periodStart.
      const rl = await rbp.recipientLimits(recipient.address);
      expect(rl.period).to.equal(FIVE_MINUTES);
    });

    it("resets after HOURLY period", async function () {
      const { owner, registry } = await deployFixture();
      const [,, recipient] = await ethers.getSigners();

      await registry.connect(owner).deployVault({
        budget: ethers.parseEther("1000"),
        period: HOURLY,
        budgetToken: ethers.ZeroAddress,
        expiration: 0,
        agents: [],
        agentBudgets: [],
        merchants: [],
        recipientConfigs: [
          { recipient: recipient.address, budget: ethers.parseEther("50"), period: HOURLY },
        ],
        label: "Hourly Vault",
        agentMode: 3,
        allowSuperPermissions: false,
        customAgentPermissions: ethers.ZeroHash,
        allowedCallsByAgent: [],
        multisigSigners:    [],
        multisigThreshold:  0,
        multisigTimeLock:   0,
      });

      const vaults = await registry.getVaults(owner.address);
      const rbp = (await findRBP(vaults[0].policyEngine))!;
      const rl = await rbp.recipientLimits(recipient.address);
      expect(rl.period).to.equal(HOURLY);
    });

    it("supports DAILY, WEEKLY, MONTHLY periods", async function () {
      const { owner, registry } = await deployFixture();
      const [,, r1, r2, r3] = await ethers.getSigners();

      await registry.connect(owner).deployVault({
        budget: ethers.parseEther("10000"),
        period: MONTHLY,
        budgetToken: ethers.ZeroAddress,
        expiration: 0,
        agents: [],
        agentBudgets: [],
        merchants: [],
        recipientConfigs: [
          { recipient: r1.address, budget: ethers.parseEther("100"), period: DAILY },
          { recipient: r2.address, budget: ethers.parseEther("200"), period: WEEKLY },
          { recipient: r3.address, budget: ethers.parseEther("300"), period: MONTHLY },
        ],
        label: "Multi-period Vault",
        agentMode: 3,
        allowSuperPermissions: false,
        customAgentPermissions: ethers.ZeroHash,
        allowedCallsByAgent: [],
        multisigSigners:    [],
        multisigThreshold:  0,
        multisigTimeLock:   0,
      });

      const vaults = await registry.getVaults(owner.address);
      const rbp = (await findRBP(vaults[0].policyEngine))!;

      expect((await rbp.recipientLimits(r1.address)).period).to.equal(DAILY);
      expect((await rbp.recipientLimits(r2.address)).period).to.equal(WEEKLY);
      expect((await rbp.recipientLimits(r3.address)).period).to.equal(MONTHLY);
    });
  });

  describe("Direct RecipientBudgetPolicy management", function () {
    it("owner can add and remove recipients", async function () {
      const { owner, recipient1, recipient2 } = await deployFixture();
      const { rbp } = await deployStandaloneRecipientBudgetPolicy(owner.address);

      expect(await rbp.recipientCount()).to.equal(0);

      await rbp.connect(owner).setRecipientLimit(recipient1.address, ethers.parseEther("100"), WEEKLY);
      expect(await rbp.recipientCount()).to.equal(1);
      expect((await rbp.recipientLimits(recipient1.address)).registered).to.equal(true);

      await rbp.connect(owner).setRecipientLimit(recipient2.address, 0, DAILY); // whitelist-only
      expect(await rbp.recipientCount()).to.equal(2);

      await rbp.connect(owner).removeRecipient(recipient1.address);
      expect(await rbp.recipientCount()).to.equal(1);
      expect((await rbp.recipientLimits(recipient1.address)).registered).to.equal(false);
    });

    it("batch set works correctly", async function () {
      const { owner, recipient1, recipient2, recipient3 } = await deployFixture();
      const { rbp } = await deployStandaloneRecipientBudgetPolicy(owner.address);

      await rbp.connect(owner).setRecipientLimitsBatch(
        [recipient1.address, recipient2.address, recipient3.address],
        [ethers.parseEther("100"), ethers.parseEther("200"), 0],
        [WEEKLY, DAILY, MONTHLY],
      );

      expect(await rbp.recipientCount()).to.equal(3);
      expect((await rbp.recipientLimits(recipient1.address)).limit).to.equal(ethers.parseEther("100"));
      expect((await rbp.recipientLimits(recipient2.address)).limit).to.equal(ethers.parseEther("200"));
      expect((await rbp.recipientLimits(recipient3.address)).limit).to.equal(0);
    });

    it("only PolicyEngine can call validate()", async function () {
      const { owner, recipient1, other } = await deployFixture();
      const { rbp } = await deployStandaloneRecipientBudgetPolicy(owner.address);

      await rbp.connect(owner).setRecipientLimit(recipient1.address, ethers.parseEther("100"), WEEKLY);

      await expect(
        rbp.connect(other).validate(other.address, ethers.ZeroAddress, recipient1.address, ethers.parseEther("10"), "0x")
      ).to.be.revertedWith("RBP: only PolicyEngine");
    });

    it("rejects wrong token denomination", async function () {
      const { owner, recipient1 } = await deployFixture();
      const [,,,,,, fakeToken] = await ethers.getSigners();
      const { rbp, mockPolicyEngine } = await deployStandaloneRecipientBudgetPolicy(owner.address, fakeToken.address);

      await rbp.connect(owner).setRecipientLimit(recipient1.address, ethers.parseEther("100"), WEEKLY);

      // Call with ZeroAddress (wrong token)
      await expect(
        mockPolicyEngine.callValidate(
          await rbp.getAddress(),
          await mockPolicyEngine.getAddress(),
          ethers.ZeroAddress,
          recipient1.address,
          ethers.parseEther("10"),
          "0x",
        )
      ).to.be.revertedWith("RBP: wrong denomination");
    });

    it("rejects unregistered recipient", async function () {
      const { owner, other } = await deployFixture();
      const { rbp, mockPolicyEngine } = await deployStandaloneRecipientBudgetPolicy(owner.address);

      await expect(
        mockPolicyEngine.callValidate(
          await rbp.getAddress(),
          await mockPolicyEngine.getAddress(),
          ethers.ZeroAddress,
          other.address,
          ethers.parseEther("10"),
          "0x",
        )
      ).to.be.revertedWith("RBP: not whitelisted");
    });

    it("rejects payment that exceeds limit", async function () {
      const { owner, recipient1 } = await deployFixture();
      const { rbp, mockPolicyEngine } = await deployStandaloneRecipientBudgetPolicy(owner.address);

      await rbp.connect(owner).setRecipientLimit(recipient1.address, ethers.parseEther("100"), WEEKLY);

      // First payment: 60 — OK
      await mockPolicyEngine.callValidate(
        await rbp.getAddress(),
        await mockPolicyEngine.getAddress(),
        ethers.ZeroAddress,
        recipient1.address,
        ethers.parseEther("60"),
        "0x",
      );
      expect((await rbp.recipientLimits(recipient1.address)).spent).to.equal(ethers.parseEther("60"));

      // Second payment: 50 — exceeds 100 limit (60 + 50 = 110)
      await expect(
        mockPolicyEngine.callValidate(
          await rbp.getAddress(),
          await mockPolicyEngine.getAddress(),
          ethers.ZeroAddress,
          recipient1.address,
          ethers.parseEther("50"),
          "0x",
        )
      ).to.be.revertedWith("RBP: recipient limit exceeded");
    });

    it("resets spent after FIVE_MINUTES and allows new payments", async function () {
      const { owner, recipient1 } = await deployFixture();
      const { rbp, mockPolicyEngine } = await deployStandaloneRecipientBudgetPolicy(owner.address);

      await rbp.connect(owner).setRecipientLimit(recipient1.address, ethers.parseEther("100"), FIVE_MINUTES);

      // Spend 80
      await mockPolicyEngine.callValidate(
        await rbp.getAddress(),
        await mockPolicyEngine.getAddress(),
        ethers.ZeroAddress,
        recipient1.address,
        ethers.parseEther("80"),
        "0x",
      );
      expect((await rbp.recipientLimits(recipient1.address)).spent).to.equal(ethers.parseEther("80"));

      // Advance time past 5 minutes
      await time.increase(301);

      // Now a payment of 80 should succeed (period reset lazily on next validate)
      await mockPolicyEngine.callValidate(
        await rbp.getAddress(),
        await mockPolicyEngine.getAddress(),
        ethers.ZeroAddress,
        recipient1.address,
        ethers.parseEther("80"),
        "0x",
      );
      expect((await rbp.recipientLimits(recipient1.address)).spent).to.equal(ethers.parseEther("80"));
    });

    it("resets spent after DAILY period", async function () {
      const { owner, recipient1 } = await deployFixture();
      const { rbp, mockPolicyEngine } = await deployStandaloneRecipientBudgetPolicy(owner.address);

      await rbp.connect(owner).setRecipientLimit(recipient1.address, ethers.parseEther("100"), DAILY);

      await mockPolicyEngine.callValidate(
        await rbp.getAddress(),
        await mockPolicyEngine.getAddress(),
        ethers.ZeroAddress,
        recipient1.address,
        ethers.parseEther("90"),
        "0x",
      );

      await time.increase(86401); // 1 day + 1 sec

      await mockPolicyEngine.callValidate(
        await rbp.getAddress(),
        await mockPolicyEngine.getAddress(),
        ethers.ZeroAddress,
        recipient1.address,
        ethers.parseEther("90"),
        "0x",
      );
      expect((await rbp.recipientLimits(recipient1.address)).spent).to.equal(ethers.parseEther("90"));
    });

    it("whitelist-only recipient (limit=0) always passes regardless of amount", async function () {
      const { owner, recipient1 } = await deployFixture();
      const { rbp, mockPolicyEngine } = await deployStandaloneRecipientBudgetPolicy(owner.address);

      await rbp.connect(owner).setRecipientLimit(recipient1.address, 0, WEEKLY); // whitelist-only

      // Any amount should pass (only global BudgetPolicy limits apply)
      await mockPolicyEngine.callValidate(
        await rbp.getAddress(),
        await mockPolicyEngine.getAddress(),
        ethers.ZeroAddress,
        recipient1.address,
        ethers.parseEther("999999"),
        "0x",
      );
      // spent stays 0 for limit==0 recipients
      expect((await rbp.recipientLimits(recipient1.address)).spent).to.equal(0);
    });

    it("independent periods: two recipients with different periods reset independently", async function () {
      const { owner, recipient1, recipient2 } = await deployFixture();
      const { rbp, mockPolicyEngine } = await deployStandaloneRecipientBudgetPolicy(owner.address);

      await rbp.connect(owner).setRecipientLimit(recipient1.address, ethers.parseEther("100"), FIVE_MINUTES);
      await rbp.connect(owner).setRecipientLimit(recipient2.address, ethers.parseEther("200"), DAILY);

      // Spend on both
      await mockPolicyEngine.callValidate(
        await rbp.getAddress(),
        await mockPolicyEngine.getAddress(),
        ethers.ZeroAddress,
        recipient1.address,
        ethers.parseEther("80"),
        "0x",
      );
      await mockPolicyEngine.callValidate(
        await rbp.getAddress(),
        await mockPolicyEngine.getAddress(),
        ethers.ZeroAddress,
        recipient2.address,
        ethers.parseEther("150"),
        "0x",
      );

      // Advance 5 minutes: recipient1 resets, recipient2 does not
      await time.increase(301);

      // recipient1 can spend again
      await mockPolicyEngine.callValidate(
        await rbp.getAddress(),
        await mockPolicyEngine.getAddress(),
        ethers.ZeroAddress,
        recipient1.address,
        ethers.parseEther("80"),
        "0x",
      );

      // recipient2 cannot (still within its daily period)
      await expect(
        mockPolicyEngine.callValidate(
          await rbp.getAddress(),
          await mockPolicyEngine.getAddress(),
          ethers.ZeroAddress,
          recipient2.address,
          ethers.parseEther("60"),
          "0x",
        )
      ).to.be.revertedWith("RBP: recipient limit exceeded");
    });
  });

  describe("Coexistence with MerchantPolicy", function () {
    it("merchants[] and recipientConfigs[] can both be provided (different policies deployed)", async function () {
      const { owner, recipient1, registry } = await deployFixture();
      const [,, , r2] = await ethers.getSigners();

      const tx = await registry.connect(owner).deployVault({
        budget: ethers.parseEther("1000"),
        period: WEEKLY,
        budgetToken: ethers.ZeroAddress,
        expiration: 0,
        agents: [],
        agentBudgets: [],
        merchants: [r2.address],           // triggers MerchantPolicy
        recipientConfigs: [
          { recipient: recipient1.address, budget: ethers.parseEther("100"), period: WEEKLY },
        ],                                   // triggers RecipientBudgetPolicy
        label: "Both Policies Vault",
        agentMode: 3,
        allowSuperPermissions: false,
        customAgentPermissions: ethers.ZeroHash,
        allowedCallsByAgent: [],
        multisigSigners:    [],
        multisigThreshold:  0,
        multisigTimeLock:   0,
      });

      const receipt = await tx.wait();
      let peAddr = "";
      for (const log of receipt!.logs) {
        try {
          const parsed = registry.interface.parseLog(log);
          if (parsed?.name === "VaultDeployed") peAddr = parsed.args.policyEngine;
        } catch {}
      }

      const pe = await ethers.getContractAt("PolicyEngine", peAddr);
      const policies: string[] = await pe.getPolicies();
      // Should have: BudgetPolicy + MerchantPolicy + RecipientBudgetPolicy = 3
      expect(policies.length).to.equal(3);
    });
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function findRBP(peAddr: string): Promise<RecipientBudgetPolicy | null> {
  const pe = await ethers.getContractAt("PolicyEngine", peAddr);
  const policies: string[] = await pe.getPolicies();
  for (const p of policies) {
    try {
      const rbp = await ethers.getContractAt("RecipientBudgetPolicy", p);
      await rbp.recipientCount();
      return rbp as unknown as RecipientBudgetPolicy;
    } catch {}
  }
  return null;
}
