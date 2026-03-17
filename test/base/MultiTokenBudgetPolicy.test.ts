import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  MultiTokenBudgetPolicy,
  PolicyEngine,
  BaseAgentVault,
  MockERC20,
} from "../../typechain-types";

// ─── helpers ──────────────────────────────────────────────────────────────────

const DAILY   = 0;
const WEEKLY  = 1;
const MONTHLY = 2;

// Dummy EntryPoint address for tests (no real ERC-4337 needed here)
const DUMMY_EP = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

async function deployFixture() {
  const [deployer, owner, agent, other] = await ethers.getSigners();

  // Deploy a minimal vault so PolicyEngine accepts it as "safe"
  const VaultFactory = await ethers.getContractFactory("BaseAgentVault");
  const vault = await VaultFactory.deploy(deployer.address, DUMMY_EP) as BaseAgentVault;

  const PEFactory = await ethers.getContractFactory("PolicyEngine");
  const pe = await PEFactory.deploy(deployer.address, await vault.getAddress()) as PolicyEngine;

  const MTBPFactory = await ethers.getContractFactory("MultiTokenBudgetPolicy");
  const mtbp = await MTBPFactory.deploy(
    deployer.address,
    await pe.getAddress()
  ) as MultiTokenBudgetPolicy;

  await pe.addPolicy(await mtbp.getAddress());

  // Wire vault → pe
  await vault.setPolicyEngine(await pe.getAddress());
  await vault.addAgent(agent.address);

  // Transfer ownership to owner
  await vault.transferOwnership(owner.address);
  await pe.transferOwnership(owner.address);
  await mtbp.transferOwnership(owner.address);

  // Deploy mock tokens
  const ERC20F = await ethers.getContractFactory("MockERC20");
  const usdc = await ERC20F.deploy("USD Coin", "USDC", 6) as MockERC20;
  const weth = await ERC20F.deploy("Wrapped ETH", "WETH", 18) as MockERC20;

  // Fund the vault with USDC and WETH
  await usdc.mint(await vault.getAddress(), ethers.parseUnits("1000", 6));
  await weth.mint(await vault.getAddress(), ethers.parseEther("5"));

  return { deployer, owner, agent, other, vault, pe, mtbp, usdc, weth };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("MultiTokenBudgetPolicy", () => {
  describe("setBudget", () => {
    it("owner can configure a token budget", async () => {
      const { owner, mtbp, usdc } = await deployFixture();
      const usdcAddr = await usdc.getAddress();

      await expect(
        mtbp.connect(owner).setBudget(usdcAddr, ethers.parseUnits("100", 6), MONTHLY)
      )
        .to.emit(mtbp, "TokenBudgetSet")
        .withArgs(usdcAddr, ethers.parseUnits("100", 6), MONTHLY);

      const b = await mtbp.tokenBudgets(usdcAddr);
      expect(b.limit).to.equal(ethers.parseUnits("100", 6));
      expect(b.configured).to.be.true;
    });

    it("non-owner cannot configure budget", async () => {
      const { other, mtbp, usdc } = await deployFixture();
      await expect(
        mtbp.connect(other).setBudget(await usdc.getAddress(), 100n, DAILY)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts on zero limit", async () => {
      const { owner, mtbp, usdc } = await deployFixture();
      await expect(
        mtbp.connect(owner).setBudget(await usdc.getAddress(), 0, DAILY)
      ).to.be.revertedWith("MTBP: limit must be > 0");
    });

    it("getConfiguredTokens returns configured tokens", async () => {
      const { owner, mtbp, usdc, weth } = await deployFixture();
      await mtbp.connect(owner).setBudget(await usdc.getAddress(), 100n, DAILY);
      await mtbp.connect(owner).setBudget(await weth.getAddress(), 100n, DAILY);
      const tokens = await mtbp.getConfiguredTokens();
      expect(tokens).to.have.lengthOf(2);
    });
  });

  describe("validate — single token", () => {
    it("allows payment within budget", async () => {
      const { owner, agent, other, vault, mtbp, usdc } = await deployFixture();
      const usdcAddr = await usdc.getAddress();
      await mtbp.connect(owner).setBudget(usdcAddr, ethers.parseUnits("100", 6), MONTHLY);

      await expect(
        vault.connect(agent).executePayment(usdcAddr, other.address, ethers.parseUnits("50", 6))
      ).to.emit(vault, "AgentPaymentExecuted");

      const b = await mtbp.tokenBudgets(usdcAddr);
      expect(b.spent).to.equal(ethers.parseUnits("50", 6));
    });

    it("rejects payment over budget", async () => {
      const { owner, agent, other, vault, mtbp, usdc } = await deployFixture();
      const usdcAddr = await usdc.getAddress();
      await mtbp.connect(owner).setBudget(usdcAddr, ethers.parseUnits("100", 6), MONTHLY);

      await expect(
        vault.connect(agent).executePayment(usdcAddr, other.address, ethers.parseUnits("101", 6))
      ).to.be.revertedWith("MTBP: budget exceeded");
    });

    it("rejects unconfigured token", async () => {
      const { agent, other, vault, weth } = await deployFixture();
      // No budget set for weth
      await expect(
        vault.connect(agent).executePayment(await weth.getAddress(), other.address, 1n)
      ).to.be.revertedWith("MTBP: no budget for token");
    });

    it("accumulates spend across multiple payments", async () => {
      const { owner, agent, other, vault, mtbp, usdc } = await deployFixture();
      const usdcAddr = await usdc.getAddress();
      await mtbp.connect(owner).setBudget(usdcAddr, ethers.parseUnits("100", 6), MONTHLY);

      await vault.connect(agent).executePayment(usdcAddr, other.address, ethers.parseUnits("60", 6));
      await expect(
        vault.connect(agent).executePayment(usdcAddr, other.address, ethers.parseUnits("41", 6))
      ).to.be.revertedWith("MTBP: budget exceeded");
    });
  });

  describe("validate — multi-token independence", () => {
    it("USDC and WETH budgets are independent", async () => {
      const { owner, agent, other, vault, mtbp, usdc, weth } = await deployFixture();
      const usdcAddr = await usdc.getAddress();
      const wethAddr = await weth.getAddress();
      await mtbp.connect(owner).setBudget(usdcAddr, ethers.parseUnits("100", 6), MONTHLY);
      await mtbp.connect(owner).setBudget(wethAddr, ethers.parseEther("1"),        MONTHLY);

      // Max out USDC budget
      await vault.connect(agent).executePayment(usdcAddr, other.address, ethers.parseUnits("100", 6));
      // WETH budget still intact
      await expect(
        vault.connect(agent).executePayment(wethAddr, other.address, ethers.parseEther("0.5"))
      ).to.emit(vault, "AgentPaymentExecuted");
    });
  });

  describe("period reset", () => {
    it("resets spend counter after period expires", async () => {
      const { owner, agent, other, vault, mtbp, usdc } = await deployFixture();
      const usdcAddr = await usdc.getAddress();
      await mtbp.connect(owner).setBudget(usdcAddr, ethers.parseUnits("100", 6), DAILY);

      await vault.connect(agent).executePayment(usdcAddr, other.address, ethers.parseUnits("100", 6));
      // Budget exhausted — should fail
      await expect(
        vault.connect(agent).executePayment(usdcAddr, other.address, 1n)
      ).to.be.revertedWith("MTBP: budget exceeded");

      // Advance time by 1 day
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      // Budget should reset
      await expect(
        vault.connect(agent).executePayment(usdcAddr, other.address, ethers.parseUnits("50", 6))
      ).to.emit(vault, "AgentPaymentExecuted");
    });

    it("emits PeriodReset event on reset", async () => {
      const { owner, agent, other, vault, mtbp, usdc } = await deployFixture();
      const usdcAddr = await usdc.getAddress();
      await mtbp.connect(owner).setBudget(usdcAddr, ethers.parseUnits("100", 6), DAILY);

      await vault.connect(agent).executePayment(usdcAddr, other.address, ethers.parseUnits("100", 6));
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        vault.connect(agent).executePayment(usdcAddr, other.address, 1n)
      ).to.emit(mtbp, "PeriodReset").withArgs(usdcAddr, anyValue);
    });
  });

  describe("removeBudget", () => {
    it("owner can remove a configured token", async () => {
      const { owner, mtbp, usdc } = await deployFixture();
      const usdcAddr = await usdc.getAddress();
      await mtbp.connect(owner).setBudget(usdcAddr, 100n, DAILY);
      await expect(mtbp.connect(owner).removeBudget(usdcAddr))
        .to.emit(mtbp, "TokenBudgetRemoved").withArgs(usdcAddr);
      const tokens = await mtbp.getConfiguredTokens();
      expect(tokens).to.have.lengthOf(0);
    });

    it("payments rejected after token removed", async () => {
      const { owner, agent, other, vault, mtbp, usdc } = await deployFixture();
      const usdcAddr = await usdc.getAddress();
      await mtbp.connect(owner).setBudget(usdcAddr, ethers.parseUnits("100", 6), MONTHLY);
      await mtbp.connect(owner).removeBudget(usdcAddr);
      await expect(
        vault.connect(agent).executePayment(usdcAddr, other.address, 1n)
      ).to.be.revertedWith("MTBP: no budget for token");
    });
  });

  describe("simulation", () => {
    it("simulateExecution does not increment spent counter", async () => {
      const { owner, agent, other, vault, pe, mtbp, usdc } = await deployFixture();
      const usdcAddr = await usdc.getAddress();
      await mtbp.connect(owner).setBudget(usdcAddr, ethers.parseUnits("100", 6), MONTHLY);

      // Dry-run via simulateExecution (eth_call — no state change)
      const [blocking] = await pe.simulateExecution.staticCall(
        agent.address, usdcAddr, other.address, ethers.parseUnits("50", 6), "0x"
      );
      expect(blocking).to.equal(ethers.ZeroAddress); // no blocking policy

      // spent counter must still be 0
      const b = await mtbp.tokenBudgets(usdcAddr);
      expect(b.spent).to.equal(0n);
    });
  });
});
