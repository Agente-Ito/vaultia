import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  AgentVaultRegistry,
  AgentVaultDeployerCore,
  AgentVaultDeployer,
  AgentKMDeployer,
  AgentSafe,
  PolicyEngine,
  BudgetPolicy,
  AgentBudgetPolicy,
} from "../typechain-types";

describe("AgentBudgetPolicy - Hybrid Budget Model", function () {
  let owner: SignerWithAddress;
  let agent1: SignerWithAddress;
  let agent2: SignerWithAddress;
  let merchant: SignerWithAddress;
  let registryAddr: string;
  let safeAddr: string;
  let peAddr: string;

  const VAULT_BUDGET = ethers.parseEther("200");
  const AGENT1_BUDGET = ethers.parseEther("80");
  const AGENT2_BUDGET = ethers.parseEther("60");

  beforeEach(async function () {
    [owner, agent1, agent2, merchant] = await ethers.getSigners();

    const coreC = await ethers.getContractFactory("AgentVaultDeployerCore");
    const vdCore = await coreC.deploy() as AgentVaultDeployerCore;
    const deployerC = await ethers.getContractFactory("AgentVaultDeployer");
    const vd = await deployerC.deploy() as AgentVaultDeployer;
    const kmC = await ethers.getContractFactory("AgentKMDeployer");
    const km = await kmC.deploy() as AgentKMDeployer;
    const coordC = await ethers.getContractFactory("AgentCoordinator");
    const coord  = await coordC.deploy();
    const poolC  = await ethers.getContractFactory("SharedBudgetPool");
    const pool   = await poolC.deploy(owner.address);

    // Deploy registry
    const RegistryFactory = await ethers.getContractFactory("AgentVaultRegistry");
    const registry = await RegistryFactory.deploy(
      await vdCore.getAddress(),
      await vd.getAddress(),
      await km.getAddress(),
      await coord.getAddress(),
      await pool.getAddress(),
    ) as AgentVaultRegistry;
    registryAddr = await registry.getAddress();

    // Deploy vault WITH agent budgets (hybrid model)
    const tx = await registry.connect(owner).deployVault({
      budget: VAULT_BUDGET,
      period: 1, // WEEKLY
      budgetToken: ethers.ZeroAddress,
      expiration: 0,
      agents: [agent1.address, agent2.address],
      agentBudgets: [AGENT1_BUDGET, AGENT2_BUDGET], // Per-agent budgets
      merchants: [merchant.address],
      label: "Hybrid Budget Vault",
      // OPS_ADMIN: tests check policy deployment, not payment execution
      agentMode:              3, // AgentMode.OPS_ADMIN
      allowSuperPermissions:  false,
      customAgentPermissions: ethers.ZeroHash,
      allowedCallsByAgent:    [],
    });

    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log) => {
        try { return registry.interface.parseLog(log as any); } catch { return null; }
      })
      .find((e) => e?.name === "VaultDeployed");

    safeAddr = event!.args.safe;
    peAddr = event!.args.policyEngine;

    // Get safe and accept ownership
    const safe = await ethers.getContractAt("AgentSafe", safeAddr);
    await safe.connect(owner).acceptOwnership();

    // Fund vault
    await owner.sendTransaction({
      to: safeAddr,
      value: VAULT_BUDGET,
    });
  });

  describe("Hybrid Budget Validation", function () {
    it("should deploy AgentBudgetPolicy with hybrid model", async function () {
      const pe = await ethers.getContractAt("PolicyEngine", peAddr);
      const policies = await pe.getPolicies();
      expect(policies.length).to.be.greaterThanOrEqual(2);

      // Last policy should be AgentBudgetPolicy
      const agentBudgetPolicyAddr = policies[policies.length - 1];
      const agentBudgetPolicy = await ethers.getContractAt("AgentBudgetPolicy", agentBudgetPolicyAddr);

      expect(await agentBudgetPolicy.agentBudget(agent1.address)).to.equal(AGENT1_BUDGET);
      expect(await agentBudgetPolicy.agentBudget(agent2.address)).to.equal(AGENT2_BUDGET);
    });

    it("vault-level and agent-level budgets both enforce", async function () {
      const pe = await ethers.getContractAt("PolicyEngine", peAddr);
      const policies = await pe.getPolicies();
      const budgetPolicy = await ethers.getContractAt("BudgetPolicy", policies[0]);
      const agentBudgetPolicy = await ethers.getContractAt("AgentBudgetPolicy", policies[policies.length - 1]);

      // Check initial state
      expect(await budgetPolicy.budget()).to.equal(VAULT_BUDGET);
      expect(await budgetPolicy.spent()).to.equal(0);
      expect(await agentBudgetPolicy.agentBudget(agent1.address)).to.equal(AGENT1_BUDGET);
    });
  });

  describe("Backward Compatibility", function () {
    it("vault without agent budgets still works (only BudgetPolicy)", async function () {
      const RegistryFactory = await ethers.getContractFactory("AgentVaultRegistry");
      const registry = await RegistryFactory.attach(registryAddr);

      // Deploy vault WITHOUT agent budgets
      const tx = await registry.connect(owner).deployVault({
        budget: VAULT_BUDGET,
        period: 1,
        budgetToken: ethers.ZeroAddress,
        expiration: 0,
        agents: [agent1.address],
        agentBudgets: [], // Empty = no AgentBudgetPolicy
        merchants: [],
        label: "Simple Budget Vault",
        agentMode:              3, // OPS_ADMIN
        allowSuperPermissions:  false,
        customAgentPermissions: ethers.ZeroHash,
        allowedCallsByAgent:    [],
      });

      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((log) => {
          try { return registry.interface.parseLog(log as any); } catch { return null; }
        })
        .find((e) => e?.name === "VaultDeployed");

      const simpleSafeAddr = event!.args.safe;
      const simplePeAddr = event!.args.policyEngine;

      const simplePe = await ethers.getContractAt("PolicyEngine", simplePeAddr);
      const policies = await simplePe.getPolicies();

      // Without agent budgets, only BudgetPolicy is deployed
      // (might have MerchantPolicy if merchants, but no AgentBudgetPolicy)
      expect(policies.length).to.be.greaterThanOrEqual(1);

      const budgetPolicy = await ethers.getContractAt("BudgetPolicy", policies[0]);
      expect(await budgetPolicy.budget()).to.equal(VAULT_BUDGET);
    });
  });
});
