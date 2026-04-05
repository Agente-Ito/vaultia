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
  RecipientBudgetPolicy,
} from "../typechain-types";
import { AgentMode, encodeAllowedCalls } from "../scripts/lsp6Keys";

const WEEKLY = 1;
const VAULT_BUDGET = ethers.parseEther("5");
const RECIPIENT_LIMIT = ethers.parseEther("2");
const ATTEMPT_COUNT = 24;

function createDeterministicRng(seed: number) {
  let state = seed >>> 0;
  return function next(maxExclusive: number) {
    state = (1664525 * state + 1013904223) >>> 0;
    return state % maxExclusive;
  };
}

describe("Vault policy stress — randomized matrix", function () {
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let merchant: SignerWithAddress;
  let limitedRecipient: SignerWithAddress;
  let outsider: SignerWithAddress;

  let safe: AgentSafe;
  let kmContract: any;
  let budgetPolicy: BudgetPolicy;
  let recipientBudgetPolicy: RecipientBudgetPolicy;

  beforeEach(async function () {
    [owner, agent, merchant, limitedRecipient, outsider] = await ethers.getSigners();

    const coreFactory = await ethers.getContractFactory("AgentVaultDeployerCore");
    const deployerFactory = await ethers.getContractFactory("AgentVaultDeployer");
    const optFactory = await ethers.getContractFactory("AgentVaultOptionalPolicyDeployer");
    const kmFactory = await ethers.getContractFactory("AgentKMDeployer");
    const msFactory = await ethers.getContractFactory("MultisigControllerDeployer");
    const registryFactory = await ethers.getContractFactory("AgentVaultRegistry");
    const coordinatorFactory = await ethers.getContractFactory("AgentCoordinator");
    const poolFactory = await ethers.getContractFactory("SharedBudgetPool");

    const vdCore = await coreFactory.deploy() as AgentVaultDeployerCore;
    const vd = await deployerFactory.deploy() as AgentVaultDeployer;
    const opt = await optFactory.deploy();
    const km = await kmFactory.deploy() as AgentKMDeployer;
    const ms = await msFactory.deploy();
    const coordinator = await coordinatorFactory.deploy();
    const pool = await poolFactory.deploy(owner.address);

    const registry = await registryFactory.deploy(
      await vdCore.getAddress(),
      await vd.getAddress(),
      await opt.getAddress(),
      await km.getAddress(),
      await coordinator.getAddress(),
      await pool.getAddress(),
      await ms.getAddress(),
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
      label: "Randomized Stress Vault",
      agentMode: AgentMode.STRICT_PAYMENTS,
      allowSuperPermissions: false,
      customAgentPermissions: ethers.ZeroHash,
      allowedCallsByAgent: [{
        agent: agent.address,
        allowedCalls: encodeAllowedCalls([merchant.address, limitedRecipient.address, outsider.address]),
      }],
      multisigSigners:    [],
      multisigThreshold:  0,
      multisigTimeLock:   0,
    });

    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log) => {
        try { return registry.interface.parseLog(log as any); } catch { return null; }
      })
      .find((parsed) => parsed?.name === "VaultDeployed");

    safe = await ethers.getContractAt("AgentSafe", event!.args.safe as string) as AgentSafe;
    kmContract = await ethers.getContractAt("LSP6KeyManager", event!.args.keyManager as string);
    const pe = await ethers.getContractAt("PolicyEngine", event!.args.policyEngine as string);
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
    await owner.sendTransaction({ to: await safe.getAddress(), value: ethers.parseEther("10") });
  });

  function paymentPayload(recipient: string, amount: bigint) {
    return safe.interface.encodeFunctionData("execute", [0, recipient, amount, "0x"]);
  }

  async function pay(recipient: string, amount: bigint) {
    return kmContract.connect(agent).execute(paymentPayload(recipient, amount));
  }

  it("maintains accounting invariants across a deterministic randomized payment matrix", async function () {
    const nextRandom = createDeterministicRng(1337);
    const amounts = [
      ethers.parseEther("0.1"),
      ethers.parseEther("0.25"),
      ethers.parseEther("0.5"),
      ethers.parseEther("0.75"),
      ethers.parseEther("1.0"),
      ethers.parseEther("1.25"),
    ];
    const recipients = [merchant.address, limitedRecipient.address, outsider.address] as const;

    let expectedVaultSpent = 0n;
    let expectedLimitedRecipientSpent = 0n;

    for (let attemptIndex = 0; attemptIndex < ATTEMPT_COUNT; attemptIndex++) {
      const amount = amounts[nextRandom(amounts.length)];
      const recipient = recipients[nextRandom(recipients.length)];

      let expectedRevertReason: string | null = null;
      if (expectedVaultSpent + amount > VAULT_BUDGET) {
        expectedRevertReason = "BP: budget exceeded";
      } else if (recipient === outsider.address) {
        expectedRevertReason = "MP: merchant not whitelisted";
      } else if (recipient === limitedRecipient.address && expectedLimitedRecipientSpent + amount > RECIPIENT_LIMIT) {
        expectedRevertReason = "RBP: recipient limit exceeded";
      }

      if (expectedRevertReason) {
        await expect(pay(recipient, amount)).to.be.revertedWith(expectedRevertReason);
      } else {
        await expect(pay(recipient, amount)).to.not.be.reverted;
        expectedVaultSpent += amount;
        if (recipient === limitedRecipient.address) {
          expectedLimitedRecipientSpent += amount;
        }
      }

      expect(await budgetPolicy.spent()).to.equal(expectedVaultSpent);
      expect((await recipientBudgetPolicy.recipientLimits(limitedRecipient.address)).spent).to.equal(expectedLimitedRecipientSpent);
    }
  });
});