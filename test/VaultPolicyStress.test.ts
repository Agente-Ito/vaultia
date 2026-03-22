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
} from "../typechain-types";
import { AgentMode, encodeAllowedCalls } from "../scripts/lsp6Keys";

const WEEKLY = 1;
const VAULT_BUDGET = ethers.parseEther("5");
const RECIPIENT_LIMIT = ethers.parseEther("2");

describe("Vault policy stress — end to end", function () {
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

  beforeEach(async function () {
    [owner, agent, merchant, limitedRecipient, outsider] = await ethers.getSigners();

    const coreC = await ethers.getContractFactory("AgentVaultDeployerCore");
    const deployerC = await ethers.getContractFactory("AgentVaultDeployer");
    const kmC = await ethers.getContractFactory("AgentKMDeployer");
    const regC = await ethers.getContractFactory("AgentVaultRegistry");
    const coordC = await ethers.getContractFactory("AgentCoordinator");
    const poolC = await ethers.getContractFactory("SharedBudgetPool");

    const vdCore = await coreC.deploy() as AgentVaultDeployerCore;
    const vd = await deployerC.deploy() as AgentVaultDeployer;
    const km = await kmC.deploy() as AgentKMDeployer;
    const coord = await coordC.deploy();
    const pool = await poolC.deploy(owner.address);

    registry = await regC.deploy(
      await vdCore.getAddress(),
      await vd.getAddress(),
      await km.getAddress(),
      await coord.getAddress(),
      await pool.getAddress(),
    ) as AgentVaultRegistry;

    const tx = await registry.connect(owner).deployVault({
      budget: VAULT_BUDGET,
      period: WEEKLY,
      budgetToken: ethers.ZeroAddress,
      expiration: 0,
      agents: [agent.address],
      agentBudgets: [],
      merchants: [merchant.address, limitedRecipient.address],
      recipientConfigs: [
        { recipient: merchant.address, budget: 0, period: WEEKLY },
        { recipient: limitedRecipient.address, budget: RECIPIENT_LIMIT, period: WEEKLY },
      ],
      label: "Stress Vault",
      agentMode: AgentMode.STRICT_PAYMENTS,
      allowSuperPermissions: false,
      customAgentPermissions: ethers.ZeroHash,
      allowedCallsByAgent: [{
        agent: agent.address,
        allowedCalls: encodeAllowedCalls([merchant.address, limitedRecipient.address, outsider.address]),
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

    let foundRbp: RecipientBudgetPolicy | null = null;
    for (const policyAddr of policies) {
      try {
        const candidate = await ethers.getContractAt("RecipientBudgetPolicy", policyAddr) as RecipientBudgetPolicy;
        await candidate.recipientCount();
        foundRbp = candidate;
        break;
      } catch {}
    }

    if (!foundRbp) {
      throw new Error("RecipientBudgetPolicy not found");
    }
    recipientBudgetPolicy = foundRbp;

    await safe.connect(owner).acceptOwnership();
    await owner.sendTransaction({ to: safeAddr, value: ethers.parseEther("10") });
  });

  function payCalldata(to: string, amount: bigint) {
    return safe.interface.encodeFunctionData("execute", [0, to, amount, "0x"]);
  }

  async function pay(to: string, amount: bigint) {
    return kmContract.connect(agent).execute(payCalldata(to, amount));
  }

  it("allows repeated payments to whitelisted recipients and records spend precisely", async function () {
    const beforeRecipientBalance = await ethers.provider.getBalance(limitedRecipient.address);

    await expect(pay(limitedRecipient.address, ethers.parseEther("0.5"))).to.not.be.reverted;
    await expect(pay(limitedRecipient.address, ethers.parseEther("0.75"))).to.not.be.reverted;
    await expect(pay(limitedRecipient.address, ethers.parseEther("0.75"))).to.not.be.reverted;

    const afterRecipientBalance = await ethers.provider.getBalance(limitedRecipient.address);
    expect(afterRecipientBalance - beforeRecipientBalance).to.equal(RECIPIENT_LIMIT);
    expect(await budgetPolicy.spent()).to.equal(RECIPIENT_LIMIT);

    const rl = await recipientBudgetPolicy.recipientLimits(limitedRecipient.address);
    expect(rl.spent).to.equal(RECIPIENT_LIMIT);
  });

  it("blocks payments above the recipient cap and leaves accounting unchanged", async function () {
    await pay(limitedRecipient.address, RECIPIENT_LIMIT);

    const budgetSpentBefore = await budgetPolicy.spent();
    const recipientBefore = await recipientBudgetPolicy.recipientLimits(limitedRecipient.address);

    await expect(
      pay(limitedRecipient.address, ethers.parseEther("0.01"))
    ).to.be.revertedWith("RBP: recipient limit exceeded");

    const budgetSpentAfter = await budgetPolicy.spent();
    const recipientAfter = await recipientBudgetPolicy.recipientLimits(limitedRecipient.address);

    expect(budgetSpentAfter).to.equal(budgetSpentBefore);
    expect(recipientAfter.spent).to.equal(recipientBefore.spent);
  });

  it("blocks transfers to non-whitelisted recipients even when KeyManager AllowedCalls permits them", async function () {
    const budgetSpentBefore = await budgetPolicy.spent();

    await expect(
      pay(outsider.address, ethers.parseEther("0.5"))
    ).to.be.revertedWith("MP: merchant not whitelisted");

    expect(await budgetPolicy.spent()).to.equal(budgetSpentBefore);
  });

  it("enforces the vault-wide budget ceiling across mixed recipients", async function () {
    await expect(pay(limitedRecipient.address, RECIPIENT_LIMIT)).to.not.be.reverted;
    await expect(pay(merchant.address, ethers.parseEther("3"))).to.not.be.reverted;

    expect(await budgetPolicy.spent()).to.equal(VAULT_BUDGET);

    await expect(
      pay(merchant.address, ethers.parseEther("0.1"))
    ).to.be.revertedWith("BP: budget exceeded");

    expect(await budgetPolicy.spent()).to.equal(VAULT_BUDGET);
  });

  it("restores recipient capacity after the configured period boundary", async function () {
    await expect(pay(limitedRecipient.address, RECIPIENT_LIMIT)).to.not.be.reverted;
    await expect(pay(limitedRecipient.address, ethers.parseEther("0.01"))).to.be.revertedWith("RBP: recipient limit exceeded");

    await time.increase(7 * 24 * 60 * 60 + 1);

    await expect(pay(limitedRecipient.address, ethers.parseEther("1"))).to.not.be.reverted;

    const rl = await recipientBudgetPolicy.recipientLimits(limitedRecipient.address);
    expect(rl.spent).to.equal(ethers.parseEther("1"));
  });
});