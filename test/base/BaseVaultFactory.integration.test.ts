import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {
  BaseVaultFactory,
  BaseVaultDeployerCore,
  BaseVaultDeployer,
  BaseAgentVault,
  PolicyEngine,
  BudgetPolicy,
  MerchantPolicy,
  ExpirationPolicy,
  AgentBudgetPolicy,
  MultiTokenBudgetPolicy,
  MockERC20,
} from "../../typechain-types";

const DUMMY_EP = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

// Period enums
const DAILY   = 0;
const WEEKLY  = 1;
const MONTHLY = 2;

async function deployFactory() {
  const [deployer, owner, agent, agent2, merchant, other] = await ethers.getSigners();

  const CoreF   = await ethers.getContractFactory("BaseVaultDeployerCore");
  const vdCore  = await CoreF.deploy() as BaseVaultDeployerCore;

  const VDF    = await ethers.getContractFactory("BaseVaultDeployer");
  const vd     = await VDF.deploy() as BaseVaultDeployer;

  const FactoryF = await ethers.getContractFactory("BaseVaultFactory");
  const factory  = await FactoryF.deploy(
    DUMMY_EP, await vdCore.getAddress(), await vd.getAddress()
  ) as BaseVaultFactory;

  const ERC20F = await ethers.getContractFactory("MockERC20");
  const usdc   = await ERC20F.deploy("USD Coin", "USDC", 6)   as MockERC20;
  const weth   = await ERC20F.deploy("Wrapped ETH", "WETH", 18) as MockERC20;

  return { deployer, owner, agent, agent2, merchant, other, factory, usdc, weth };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function singleTokenParams(usdc: MockERC20, agents: string[], merchants: string[] = []) {
  return {
    label:        "Test Vault",
    token:        await usdc.getAddress(),
    budget:       ethers.parseUnits("100", 6),
    period:       MONTHLY,
    tokenBudgets: [],
    expiration:   0n,
    agents,
    agentBudgets: [],
    merchants,
  };
}

async function multiTokenParams(usdc: MockERC20, weth: MockERC20, agents: string[]) {
  return {
    label:  "Multi-token Vault",
    token:  ethers.ZeroAddress,
    budget: 0n,
    period: MONTHLY,
    tokenBudgets: [
      { token: await usdc.getAddress(), limit: ethers.parseUnits("200", 6), period: MONTHLY },
      { token: await weth.getAddress(), limit: ethers.parseEther("1"),       period: WEEKLY  },
    ],
    expiration:   0n,
    agents,
    agentBudgets: [],
    merchants:    [],
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("BaseVaultFactory — integration", () => {

  describe("single-token vault deployment", () => {
    it("deploys vault stack and emits VaultDeployed", async () => {
      const { owner, agent, factory, usdc } = await deployFactory();
      const params = await singleTokenParams(usdc, [agent.address]);

      await expect(factory.connect(owner).deployVault(params))
        .to.emit(factory, "VaultDeployed")
        .withArgs(
          owner.address,
          anyValue,           // vault address
          anyValue,           // policyEngine address
          "Test Vault",
          await usdc.getAddress(),
          anyValue            // chainId
        );
    });

    it("owner receives vault and policyEngine ownership", async () => {
      const { owner, agent, factory, usdc } = await deployFactory();
      const params = await singleTokenParams(usdc, [agent.address]);

      const tx = await factory.connect(owner).deployVault(params);
      const receipt = await tx.wait();
      const vaultAddr = (await factory.getVaults(owner.address))[0].vault;

      const vault = await ethers.getContractAt("BaseAgentVault", vaultAddr) as BaseAgentVault;
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("agent is authorized after deployment", async () => {
      const { owner, agent, factory, usdc } = await deployFactory();
      const params = await singleTokenParams(usdc, [agent.address]);
      await factory.connect(owner).deployVault(params);

      const vaultAddr = (await factory.getVaults(owner.address))[0].vault;
      const vault = await ethers.getContractAt("BaseAgentVault", vaultAddr) as BaseAgentVault;
      expect(await vault.authorizedAgents(agent.address)).to.be.true;
    });

    it("policyEngine linked to vault as safe", async () => {
      const { owner, agent, factory, usdc } = await deployFactory();
      const params = await singleTokenParams(usdc, [agent.address]);
      await factory.connect(owner).deployVault(params);

      const record   = (await factory.getVaults(owner.address))[0];
      const pe       = await ethers.getContractAt("PolicyEngine", record.policyEngine) as PolicyEngine;
      expect(await pe.safe()).to.equal(record.vault);
    });

    it("BudgetPolicy is configured with correct token and budget", async () => {
      const { owner, agent, factory, usdc } = await deployFactory();
      const params = await singleTokenParams(usdc, [agent.address]);
      await factory.connect(owner).deployVault(params);

      const record = (await factory.getVaults(owner.address))[0];
      const pe     = await ethers.getContractAt("PolicyEngine", record.policyEngine) as PolicyEngine;
      const policies = await pe.getPolicies();
      expect(policies).to.have.lengthOf(1);

      const bp = await ethers.getContractAt("BudgetPolicy", policies[0]) as BudgetPolicy;
      expect(await bp.budget()).to.equal(ethers.parseUnits("100", 6));
      expect(await bp.budgetToken()).to.equal(await usdc.getAddress());
    });

    it("getVaults returns correct record with token", async () => {
      const { owner, agent, factory, usdc } = await deployFactory();
      const params = await singleTokenParams(usdc, [agent.address]);
      await factory.connect(owner).deployVault(params);

      const vaults = await factory.getVaults(owner.address);
      expect(vaults).to.have.lengthOf(1);
      expect(vaults[0].label).to.equal("Test Vault");
      expect(vaults[0].token).to.equal(await usdc.getAddress());
    });
  });

  describe("with MerchantPolicy", () => {
    it("deploys MerchantPolicy when merchants provided", async () => {
      const { owner, agent, merchant, factory, usdc } = await deployFactory();
      const params = await singleTokenParams(usdc, [agent.address], [merchant.address]);
      await factory.connect(owner).deployVault(params);

      const record   = (await factory.getVaults(owner.address))[0];
      const pe       = await ethers.getContractAt("PolicyEngine", record.policyEngine) as PolicyEngine;
      const policies = await pe.getPolicies();
      expect(policies).to.have.lengthOf(2); // BudgetPolicy + MerchantPolicy
    });

    it("agent can pay whitelisted merchant, blocked for non-merchant", async () => {
      const { owner, agent, merchant, other, factory, usdc } = await deployFactory();
      const params = await singleTokenParams(usdc, [agent.address], [merchant.address]);
      await factory.connect(owner).deployVault(params);

      const vaultAddr = (await factory.getVaults(owner.address))[0].vault;
      const vault     = await ethers.getContractAt("BaseAgentVault", vaultAddr) as BaseAgentVault;
      const usdcAddr  = await usdc.getAddress();

      // Fund vault
      await usdc.mint(vaultAddr, ethers.parseUnits("500", 6));

      // Merchant is whitelisted
      await expect(
        vault.connect(agent).executePayment(usdcAddr, merchant.address, ethers.parseUnits("10", 6))
      ).to.emit(vault, "AgentPaymentExecuted");

      // Other is not whitelisted
      await expect(
        vault.connect(agent).executePayment(usdcAddr, other.address, ethers.parseUnits("10", 6))
      ).to.be.revertedWith("MP: merchant not whitelisted");
    });
  });

  describe("with ExpirationPolicy", () => {
    it("deploys ExpirationPolicy when expiration provided", async () => {
      const { owner, agent, factory, usdc } = await deployFactory();
      const block  = await ethers.provider.getBlock("latest");
      const future = BigInt(block!.timestamp + 86400 * 7); // 7 days from current block
      const params = { ...(await singleTokenParams(usdc, [agent.address])), expiration: future };
      await factory.connect(owner).deployVault(params);

      const record   = (await factory.getVaults(owner.address))[0];
      const pe       = await ethers.getContractAt("PolicyEngine", record.policyEngine) as PolicyEngine;
      const policies = await pe.getPolicies();
      expect(policies).to.have.lengthOf(2); // BudgetPolicy + ExpirationPolicy
    });

    it("blocks payment after expiration", async () => {
      const { owner, agent, other, factory, usdc } = await deployFactory();
      const block  = await ethers.provider.getBlock("latest");
      const future = BigInt(block!.timestamp + 3600); // expires 1h from current block
      const params = { ...(await singleTokenParams(usdc, [agent.address])), expiration: future };
      await factory.connect(owner).deployVault(params);

      const vaultAddr = (await factory.getVaults(owner.address))[0].vault;
      const vault     = await ethers.getContractAt("BaseAgentVault", vaultAddr) as BaseAgentVault;
      await usdc.mint(vaultAddr, ethers.parseUnits("500", 6));

      // Advance past expiration (1h + 60s buffer)
      await ethers.provider.send("evm_increaseTime", [3660]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        vault.connect(agent).executePayment(await usdc.getAddress(), other.address, 1n)
      ).to.be.revertedWith("EP: vault expired");
    });
  });

  describe("with AgentBudgetPolicy", () => {
    it("deploys AgentBudgetPolicy when agentBudgets provided", async () => {
      const { owner, agent, factory, usdc } = await deployFactory();
      const params = {
        ...(await singleTokenParams(usdc, [agent.address])),
        agentBudgets: [ethers.parseUnits("50", 6)],
      };
      await factory.connect(owner).deployVault(params);

      const record   = (await factory.getVaults(owner.address))[0];
      const pe       = await ethers.getContractAt("PolicyEngine", record.policyEngine) as PolicyEngine;
      const policies = await pe.getPolicies();
      expect(policies).to.have.lengthOf(2); // BudgetPolicy + AgentBudgetPolicy
    });

    it("agent cannot exceed individual budget even if vault budget allows", async () => {
      const { owner, agent, other, factory, usdc } = await deployFactory();
      const params = {
        ...(await singleTokenParams(usdc, [agent.address])),
        agentBudgets: [ethers.parseUnits("30", 6)], // agent limited to 30 USDC
      };
      await factory.connect(owner).deployVault(params);

      const vaultAddr = (await factory.getVaults(owner.address))[0].vault;
      const vault     = await ethers.getContractAt("BaseAgentVault", vaultAddr) as BaseAgentVault;
      await usdc.mint(vaultAddr, ethers.parseUnits("500", 6));

      await expect(
        vault.connect(agent).executePayment(
          await usdc.getAddress(), other.address, ethers.parseUnits("31", 6)
        )
      ).to.be.revertedWith("ABP: agent budget exceeded");
    });
  });

  describe("multi-token vault deployment", () => {
    it("deploys MultiTokenBudgetPolicy with configured tokens", async () => {
      const { owner, agent, factory, usdc, weth } = await deployFactory();
      const params = await multiTokenParams(usdc, weth, [agent.address]);
      await factory.connect(owner).deployVault(params);

      const record   = (await factory.getVaults(owner.address))[0];
      const pe       = await ethers.getContractAt("PolicyEngine", record.policyEngine) as PolicyEngine;
      const policies = await pe.getPolicies();
      expect(policies).to.have.lengthOf(1); // MultiTokenBudgetPolicy only

      const mtbp    = await ethers.getContractAt("MultiTokenBudgetPolicy", policies[0]) as MultiTokenBudgetPolicy;
      const tokens  = await mtbp.getConfiguredTokens();
      expect(tokens).to.include(await usdc.getAddress());
      expect(tokens).to.include(await weth.getAddress());
    });

    it("vault record token is address(0) for multi-token", async () => {
      const { owner, agent, factory, usdc, weth } = await deployFactory();
      const params = await multiTokenParams(usdc, weth, [agent.address]);
      await factory.connect(owner).deployVault(params);

      const vaults = await factory.getVaults(owner.address);
      expect(vaults[0].token).to.equal(ethers.ZeroAddress);
    });

    it("agent can spend USDC and WETH independently", async () => {
      const { owner, agent, other, factory, usdc, weth } = await deployFactory();
      const params = await multiTokenParams(usdc, weth, [agent.address]);
      await factory.connect(owner).deployVault(params);

      const vaultAddr = (await factory.getVaults(owner.address))[0].vault;
      const vault     = await ethers.getContractAt("BaseAgentVault", vaultAddr) as BaseAgentVault;
      await usdc.mint(vaultAddr, ethers.parseUnits("500", 6));
      await weth.mint(vaultAddr, ethers.parseEther("5"));

      await expect(
        vault.connect(agent).executePayment(await usdc.getAddress(), other.address, ethers.parseUnits("50", 6))
      ).to.emit(vault, "AgentPaymentExecuted");

      await expect(
        vault.connect(agent).executePayment(await weth.getAddress(), other.address, ethers.parseEther("0.5"))
      ).to.emit(vault, "AgentPaymentExecuted");
    });
  });

  describe("multiple vaults per owner", () => {
    it("owner can deploy multiple vaults", async () => {
      const { owner, agent, factory, usdc } = await deployFactory();
      const params = await singleTokenParams(usdc, [agent.address]);
      await factory.connect(owner).deployVault(params);
      await factory.connect(owner).deployVault({ ...params, label: "Vault 2" });
      expect(await factory.getVaults(owner.address)).to.have.lengthOf(2);
    });
  });

  describe("deployVaultOnBehalf", () => {
    it("authorized caller can deploy on behalf of owner", async () => {
      const { deployer, owner, agent, factory, usdc } = await deployFactory();
      await factory.setAuthorizedCaller(deployer.address, true);
      const params = await singleTokenParams(usdc, [agent.address]);

      await expect(
        factory.connect(deployer).deployVaultOnBehalf(owner.address, params)
      ).to.emit(factory, "VaultDeployed").withArgs(
        owner.address, anyValue, anyValue,
        "Test Vault", await usdc.getAddress(), anyValue
      );

      const vaultAddr = (await factory.getVaults(owner.address))[0].vault;
      const vault = await ethers.getContractAt("BaseAgentVault", vaultAddr) as BaseAgentVault;
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("unauthorized caller is rejected", async () => {
      const { owner, other, factory, usdc } = await deployFactory();
      const params = await singleTokenParams(usdc, [owner.address]);
      await expect(
        factory.connect(other).deployVaultOnBehalf(owner.address, params)
      ).to.be.revertedWith("BVF: caller not authorized");
    });
  });

  describe("validation guards", () => {
    it("rejects too many agents", async () => {
      const { owner, factory, usdc } = await deployFactory();
      const agents = Array.from({ length: 21 }, () => ethers.Wallet.createRandom().address);
      const params = { ...(await singleTokenParams(usdc, agents)) };
      await expect(factory.connect(owner).deployVault(params))
        .to.be.revertedWith("BVF: too many agents");
    });

    it("rejects agentBudgets length mismatch", async () => {
      const { owner, agent, factory, usdc } = await deployFactory();
      const params = {
        ...(await singleTokenParams(usdc, [agent.address])),
        agentBudgets: [100n, 200n], // 2 budgets for 1 agent
      };
      await expect(factory.connect(owner).deployVault(params))
        .to.be.revertedWith("BVF: agentBudgets length mismatch");
    });

    it("rejects when both single-token and multi-token params set", async () => {
      const { owner, agent, factory, usdc, weth } = await deployFactory();
      const params = {
        ...(await singleTokenParams(usdc, [agent.address])),
        tokenBudgets: [
          { token: await weth.getAddress(), limit: 100n, period: MONTHLY }
        ],
      };
      await expect(factory.connect(owner).deployVault(params))
        .to.be.revertedWith("BVF: specify either budget or tokenBudgets");
    });

    it("rejects expiration in the past", async () => {
      const { owner, agent, factory, usdc } = await deployFactory();
      const past = BigInt(Math.floor(Date.now() / 1000) - 60);
      const params = { ...(await singleTokenParams(usdc, [agent.address])), expiration: past };
      await expect(factory.connect(owner).deployVault(params))
        .to.be.revertedWith("BVF: expiration in the past");
    });
  });
});
