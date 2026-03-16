import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { AgentSafe, PolicyEngine, BudgetPolicy, MockReentrantToken } from "../typechain-types";

describe("AgentSafe", function () {
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let merchant: SignerWithAddress;
  let attacker: SignerWithAddress;
  let safe: AgentSafe;
  let policyEngine: PolicyEngine;
  let budgetPolicy: BudgetPolicy;

  const BUDGET = ethers.parseEther("100");

  beforeEach(async function () {
    [owner, agent, merchant, attacker] = await ethers.getSigners();

    // Deploy contracts (mimicking registry's temp-owner pattern)
    const AgentSafeFactory = await ethers.getContractFactory("AgentSafe");
    safe = await AgentSafeFactory.deploy(owner.address);

    const PolicyEngineFactory = await ethers.getContractFactory("PolicyEngine");
    policyEngine = await PolicyEngineFactory.deploy(owner.address, await safe.getAddress());

    const BudgetPolicyFactory = await ethers.getContractFactory("BudgetPolicy");
    budgetPolicy = await BudgetPolicyFactory.deploy(
      owner.address,
      await policyEngine.getAddress(),
      BUDGET,
      0, // DAILY
      ethers.ZeroAddress // LYX budget
    );

    // Wire up
    await policyEngine.addPolicy(await budgetPolicy.getAddress());
    await safe.setPolicyEngine(await policyEngine.getAddress());

    // Deploy a mock LSP6 KeyManager (we use agent signer directly for simplicity in tests)
    // In unit tests we set agent as the KeyManager so agentExecute can be called
    await safe.setKeyManager(agent.address);

    // Fund the safe
    await owner.sendTransaction({ to: await safe.getAddress(), value: ethers.parseEther("200") });
  });

  describe("Setup", function () {
    it("should have correct policyEngine and keyManager set", async function () {
      expect(await safe.policyEngine()).to.equal(await policyEngine.getAddress());
      expect(await safe.vaultKeyManager()).to.equal(agent.address);
    });

    it("should reject setPolicyEngine if already set", async function () {
      await expect(
        safe.setPolicyEngine(await policyEngine.getAddress())
      ).to.be.revertedWith("AS: PE already set");
    });

    it("should reject setPolicyEngine with EOA address", async function () {
      const AgentSafeFactory = await ethers.getContractFactory("AgentSafe");
      const newSafe = await AgentSafeFactory.deploy(owner.address);
      await expect(
        newSafe.setPolicyEngine(attacker.address)
      ).to.be.revertedWith("AS: PE must be a contract");
    });

    it("should reject setKeyManager if already set", async function () {
      await expect(
        safe.setKeyManager(attacker.address)
      ).to.be.revertedWith("AS: KM already set");
    });
  });

  describe("onlyViaKeyManager guard", function () {
    it("should reject agentExecute called directly (not via KM)", async function () {
      await expect(
        safe.connect(attacker).agentExecute(merchant.address, ethers.parseEther("1"), "0x")
      ).to.be.revertedWith("AS: must call via KeyManager");
    });

    it("should reject agentExecute from owner (not via KM)", async function () {
      await expect(
        safe.connect(owner).agentExecute(merchant.address, ethers.parseEther("1"), "0x")
      ).to.be.revertedWith("AS: must call via KeyManager");
    });
  });

  describe("agentExecute — LYX payments", function () {
    it("should execute payment when all policies pass", async function () {
      const merchantBefore = await ethers.provider.getBalance(merchant.address);
      await safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("10"), "0x");
      const merchantAfter = await ethers.provider.getBalance(merchant.address);
      expect(merchantAfter - merchantBefore).to.equal(ethers.parseEther("10"));
    });

    it("should update budget spent", async function () {
      await safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("10"), "0x");
      expect(await budgetPolicy.spent()).to.equal(ethers.parseEther("10"));
    });

    it("should emit AgentPaymentExecuted event", async function () {
      await expect(
        safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("5"), "0x")
      )
        .to.emit(safe, "AgentPaymentExecuted")
        .withArgs(agent.address, merchant.address, ethers.parseEther("5"));
    });

    it("should revert when budget exceeded", async function () {
      await expect(
        safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("101"), "0x")
      ).to.be.revertedWith("BP: budget exceeded");
    });

    it("should revert when insufficient LYX balance", async function () {
      // Drain the safe first by sending almost everything as owner
      const balance = await ethers.provider.getBalance(await safe.getAddress());
      // We can't call execute directly unless we are owner, so let's just check a large amount
      await expect(
        safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("300"), "0x")
      ).to.be.revertedWith("AS: insufficient LYX balance");
    });

    it("should reject wrong denomination (token payment via agentExecute)", async function () {
      // BudgetPolicy has budgetToken = address(0) (LYX only)
      // agentExecute always passes address(0) as token, so this always matches — no rejection
      // To test denomination mismatch, deploy a budget policy with a token budget
      const BudgetPolicyFactory = await ethers.getContractFactory("BudgetPolicy");
      const tokenBudget = await BudgetPolicyFactory.deploy(
        owner.address,
        await policyEngine.getAddress(),
        BUDGET,
        0,
        merchant.address // non-zero = token budget
      );
      await policyEngine.addPolicy(await tokenBudget.getAddress());
      // Now any agentExecute (which passes address(0)) will fail the second budget policy
      await expect(
        safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("1"), "0x")
      ).to.be.revertedWith("BP: wrong denomination");
    });
  });

  describe("agentTransferToken — reentrancy protection", function () {
    it("should revert on reentrant agentTransferToken call via malicious token", async function () {
      // Deploy mock reentrant token
      const MockTokenFactory = await ethers.getContractFactory("MockReentrantToken");
      const reentrantToken = await MockTokenFactory.deploy() as unknown as MockReentrantToken;

      // Mint tokens to safe
      await (reentrantToken as any).mint(await safe.getAddress(), 1000n);

      // Point the attack at the safe
      await (reentrantToken as any).setTarget(await safe.getAddress());

      // Deploy a token-budget policy so the transfer doesn't revert on denomination
      const BudgetPolicyFactory = await ethers.getContractFactory("BudgetPolicy");
      const tokenBudget = await BudgetPolicyFactory.deploy(
        owner.address,
        await policyEngine.getAddress(),
        1_000_000n,
        0,
        await reentrantToken.getAddress()
      );
      await policyEngine.addPolicy(await tokenBudget.getAddress());

      // The outer call: safe.agentTransferToken → token.transfer → tries to re-enter → blocked
      await expect(
        safe.connect(agent).agentTransferToken(
          await reentrantToken.getAddress(),
          merchant.address,
          100n,
          true,
          "0x"
        )
      ).to.be.reverted; // nonReentrant fires: "ReentrancyGuard: reentrant call"
    });
  });

  describe("agentTransferToken guard", function () {
    it("should reject token = address(0)", async function () {
      await expect(
        safe.connect(agent).agentTransferToken(
          ethers.ZeroAddress,
          merchant.address,
          100n,
          true,
          "0x"
        )
      ).to.be.revertedWith("AS: token cannot be zero address");
    });

    it("should reject if called by non-KM", async function () {
      await expect(
        safe.connect(attacker).agentTransferToken(
          merchant.address, // any non-zero token
          merchant.address,
          100n,
          true,
          "0x"
        )
      ).to.be.revertedWith("AS: must call via KeyManager");
    });
  });
});
