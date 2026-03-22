import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  AgentVaultRegistry,
  AgentVaultDeployerCore,
  AgentVaultDeployer,
  AgentKMDeployer,
  AgentSafe,
  BudgetPolicy,
  RecipientBudgetPolicy,
  LSP7DemoToken,
} from "../typechain-types";
import { AgentMode, encodeAllowedCalls } from "../scripts/lsp6Keys";

const WEEKLY = 1;
const TOKEN_BUDGET = ethers.parseEther("5");
const RECIPIENT_LIMIT = ethers.parseEther("2");

describe("Vault policy stress — LSP7 end to end", function () {
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let merchant: SignerWithAddress;
  let limitedRecipient: SignerWithAddress;
  let outsider: SignerWithAddress;

  let registry: AgentVaultRegistry;
  let safe: AgentSafe;
  let kmContract: any;
  let budgetPolicy: BudgetPolicy;
  let recipientBudgetPolicy: RecipientBudgetPolicy;
  let token: LSP7DemoToken;

  beforeEach(async function () {
    [owner, agent, merchant, limitedRecipient, outsider] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("LSP7DemoToken");
    token = await tokenFactory.deploy(owner.address) as LSP7DemoToken;

    const coreFactory = await ethers.getContractFactory("AgentVaultDeployerCore");
    const deployerFactory = await ethers.getContractFactory("AgentVaultDeployer");
    const kmFactory = await ethers.getContractFactory("AgentKMDeployer");
    const registryFactory = await ethers.getContractFactory("AgentVaultRegistry");
    const coordinatorFactory = await ethers.getContractFactory("AgentCoordinator");
    const poolFactory = await ethers.getContractFactory("SharedBudgetPool");

    const vdCore = await coreFactory.deploy() as AgentVaultDeployerCore;
    const vd = await deployerFactory.deploy() as AgentVaultDeployer;
    const km = await kmFactory.deploy() as AgentKMDeployer;
    const coordinator = await coordinatorFactory.deploy();
    const pool = await poolFactory.deploy(owner.address);

    registry = await registryFactory.deploy(
      await vdCore.getAddress(),
      await vd.getAddress(),
      await km.getAddress(),
      await coordinator.getAddress(),
      await pool.getAddress(),
    ) as AgentVaultRegistry;

    const allowedTargets = [
      await token.getAddress(),
      merchant.address,
      limitedRecipient.address,
      outsider.address,
    ];

    const tx = await registry.connect(owner).deployVault({
      budget: TOKEN_BUDGET,
      period: WEEKLY,
      budgetToken: await token.getAddress(),
      expiration: 0,
      agents: [agent.address],
      agentBudgets: [],
      merchants: [merchant.address, limitedRecipient.address],
      recipientConfigs: [
        { recipient: merchant.address, budget: 0, period: WEEKLY },
        { recipient: limitedRecipient.address, budget: RECIPIENT_LIMIT, period: WEEKLY },
      ],
      label: "Stress Token Vault",
      agentMode: AgentMode.STRICT_PAYMENTS,
      allowSuperPermissions: false,
      customAgentPermissions: ethers.ZeroHash,
      allowedCallsByAgent: [{
        agent: agent.address,
        allowedCalls: encodeAllowedCalls(allowedTargets),
      }],
    });

    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log) => {
        try { return registry.interface.parseLog(log as any); } catch { return null; }
      })
      .find((parsed) => parsed?.name === "VaultDeployed");

    const safeAddr = event!.args.safe as string;
    const kmAddr = event!.args.keyManager as string;
    const peAddr = event!.args.policyEngine as string;

    safe = await ethers.getContractAt("AgentSafe", safeAddr) as AgentSafe;
    kmContract = await ethers.getContractAt("LSP6KeyManager", kmAddr);
    const pe = await ethers.getContractAt("PolicyEngine", peAddr);
    const policies = await pe.getPolicies();

    budgetPolicy = await ethers.getContractAt("BudgetPolicy", policies[0]) as BudgetPolicy;

    let foundPolicy: RecipientBudgetPolicy | null = null;
    for (const policyAddr of policies) {
      try {
        const candidate = await ethers.getContractAt("RecipientBudgetPolicy", policyAddr) as RecipientBudgetPolicy;
        await candidate.recipientCount();
        foundPolicy = candidate;
        break;
      } catch {}
    }

    if (!foundPolicy) {
      throw new Error("RecipientBudgetPolicy not found");
    }
    recipientBudgetPolicy = foundPolicy;

    await safe.connect(owner).acceptOwnership();
    await token.mint(safeAddr, ethers.parseEther("10"));
    await owner.sendTransaction({ to: safeAddr, value: ethers.parseEther("2") });
  });

  function tokenTransferPayload(recipient: string, amount: bigint) {
    const transferData = token.interface.encodeFunctionData("transfer", [
      safe.target,
      recipient,
      amount,
      true,
      "0x",
    ]);

    return safe.interface.encodeFunctionData("execute", [
      0,
      token.target,
      0,
      transferData,
    ]);
  }

  async function transferToken(recipient: string, amount: bigint) {
    return kmContract.connect(agent).execute(tokenTransferPayload(recipient, amount));
  }

  it("allows repeated LSP7 transfers to whitelisted recipients and records spend", async function () {
    const beforeBalance = await token.balanceOf(limitedRecipient.address);

    await expect(transferToken(limitedRecipient.address, ethers.parseEther("0.5"))).to.not.be.reverted;
    await expect(transferToken(limitedRecipient.address, ethers.parseEther("0.75"))).to.not.be.reverted;
    await expect(transferToken(limitedRecipient.address, ethers.parseEther("0.75"))).to.not.be.reverted;

    const afterBalance = await token.balanceOf(limitedRecipient.address);
    expect(afterBalance - beforeBalance).to.equal(RECIPIENT_LIMIT);
    expect(await budgetPolicy.spent()).to.equal(RECIPIENT_LIMIT);
    expect((await recipientBudgetPolicy.recipientLimits(limitedRecipient.address)).spent).to.equal(RECIPIENT_LIMIT);
  });

  it("blocks LSP7 transfers above the recipient cap and preserves accounting", async function () {
    await transferToken(limitedRecipient.address, RECIPIENT_LIMIT);

    const vaultSpentBefore = await budgetPolicy.spent();
    const recipientSpentBefore = (await recipientBudgetPolicy.recipientLimits(limitedRecipient.address)).spent;

    await expect(
      transferToken(limitedRecipient.address, ethers.parseEther("0.01"))
    ).to.be.revertedWith("RBP: recipient limit exceeded");

    expect(await budgetPolicy.spent()).to.equal(vaultSpentBefore);
    expect((await recipientBudgetPolicy.recipientLimits(limitedRecipient.address)).spent).to.equal(recipientSpentBefore);
  });

  it("blocks token transfers to non-whitelisted recipients", async function () {
    const beforeVaultSpent = await budgetPolicy.spent();

    await expect(
      transferToken(outsider.address, ethers.parseEther("0.5"))
    ).to.be.revertedWith("MP: merchant not whitelisted");

    expect(await budgetPolicy.spent()).to.equal(beforeVaultSpent);
  });

  it("enforces the token vault-wide budget ceiling across mixed transfers", async function () {
    await expect(transferToken(limitedRecipient.address, RECIPIENT_LIMIT)).to.not.be.reverted;
    await expect(transferToken(merchant.address, ethers.parseEther("3"))).to.not.be.reverted;

    expect(await budgetPolicy.spent()).to.equal(TOKEN_BUDGET);

    await expect(
      transferToken(merchant.address, ethers.parseEther("0.1"))
    ).to.be.revertedWith("BP: budget exceeded");
  });

  it("rejects native transfers from a token-denominated vault", async function () {
    const nativePayload = safe.interface.encodeFunctionData("execute", [
      0,
      merchant.address,
      ethers.parseEther("1"),
      "0x",
    ]);

    await expect(
      kmContract.connect(agent).execute(nativePayload)
    ).to.be.revertedWith("BP: wrong denomination");
  });

  it("restores recipient token capacity after the configured period boundary", async function () {
    await expect(transferToken(limitedRecipient.address, RECIPIENT_LIMIT)).to.not.be.reverted;
    await expect(transferToken(limitedRecipient.address, ethers.parseEther("0.01"))).to.be.revertedWith("RBP: recipient limit exceeded");

    await time.increase(7 * 24 * 60 * 60 + 1);

    await expect(transferToken(limitedRecipient.address, ethers.parseEther("1"))).to.not.be.reverted;
    expect((await recipientBudgetPolicy.recipientLimits(limitedRecipient.address)).spent).to.equal(ethers.parseEther("1"));
  });
});