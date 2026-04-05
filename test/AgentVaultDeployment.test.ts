/**
 * AgentVaultDeployment.test.ts
 *
 * Covers all 7 test cases for the deployForAgent() extension to AgentVaultRegistry.
 *
 * The invariant under test: an agent with CAN_DEPLOY can atomically deploy a child vault,
 * allocate budget from its own pool, and register an operator agent — all while the
 * human remains the root owner. The deploying agent is a builder, never an owner.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  AgentVaultRegistry,
  AgentVaultDeployerCore,
  AgentVaultDeployer,
  AgentKMDeployer,
  AgentCoordinator,
  SharedBudgetPool,
  AgentSafe,
} from "../typechain-types";

describe("AgentVaultDeployment — deployForAgent()", function () {
  let owner: SignerWithAddress;    // human root
  let agentA: SignerWithAddress;   // deploying agent (holds CAN_DEPLOY)
  let agentB: SignerWithAddress;   // assigned operator of the new vault
  let agentC: SignerWithAddress;   // third-level agent for depth tests
  let stranger: SignerWithAddress; // unregistered account

  let registry:    AgentVaultRegistry;
  let coordinator: AgentCoordinator;
  let pool:        SharedBudgetPool;

  const VAULT_BUDGET   = ethers.parseEther("1000"); // human root vault budget
  const CHILD_BUDGET   = ethers.parseEther("300");  // allocated to child vault

  // ─── Shared setup ─────────────────────────────────────────────────────────

  beforeEach(async function () {
    [owner, agentA, agentB, agentC, stranger] = await ethers.getSigners();

    // Deploy sub-contracts
    const coreC     = await ethers.getContractFactory("AgentVaultDeployerCore");
    const deployerC = await ethers.getContractFactory("AgentVaultDeployer");
    const optC      = await ethers.getContractFactory("AgentVaultOptionalPolicyDeployer");
    const kmC       = await ethers.getContractFactory("AgentKMDeployer");
    const msC       = await ethers.getContractFactory("MultisigControllerDeployer");
    const coordC    = await ethers.getContractFactory("AgentCoordinator");
    const poolC     = await ethers.getContractFactory("SharedBudgetPool");
    const regC      = await ethers.getContractFactory("AgentVaultRegistry");

    const vdCore = await coreC.deploy()     as AgentVaultDeployerCore;
    const vd     = await deployerC.deploy() as AgentVaultDeployer;
    const opt    = await optC.deploy();
    const km     = await kmC.deploy()       as AgentKMDeployer;
    const ms     = await msC.deploy();

    coordinator = await coordC.deploy() as AgentCoordinator;
    // Use registry address as authorizedPolicy placeholder; we update it after registry deploy.
    // For tests that don't exercise recordSpend, owner.address suffices.
    pool = await poolC.deploy(owner.address) as SharedBudgetPool;

    registry = await regC.deploy(
      await vdCore.getAddress(),
      await vd.getAddress(),
      await opt.getAddress(),
      await km.getAddress(),
      await coordinator.getAddress(),
      await pool.getAddress(),
      await ms.getAddress(),
    ) as AgentVaultRegistry;

    // Authorize registry to call registerAgent/assignRole/setDelegationDepth on coordinator
    await coordinator.setAuthorizedCaller(await registry.getAddress(), true);

    // Authorize registry to call createPool on the pool
    await pool.setAuthorizedDeployer(await registry.getAddress(), true);
  });

  // ─── Helper: deploy a human root vault and seed AgentA with CAN_DEPLOY ────

  async function setupHumanVaultAndAgentA(): Promise<{ rootVaultAddress: string }> {
    // 1. Human deploys root vault (sets agentRootOwner[owner] = owner)
    const tx = await registry.connect(owner).deployVault({
      budget:                 VAULT_BUDGET,
      period:                 1, // WEEKLY
      budgetToken:            ethers.ZeroAddress,
      expiration:             0,
      agents:                 [],
      agentBudgets:           [],
      merchants:              [],
      label:                  "Root Vault",
      agentMode:              3, // OPS_ADMIN — no AllowedCalls required
      allowSuperPermissions:  false,
      customAgentPermissions: ethers.ZeroHash,
      allowedCallsByAgent:    [],
      recipientConfigs:       [],
      multisigSigners:        [],
      multisigThreshold:      0,
      multisigTimeLock:       0,
    });
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map(log => { try { return registry.interface.parseLog(log as any); } catch { return null; } })
      .find(e => e?.name === "VaultDeployed");
    const rootVaultAddress: string = event!.args.safe;

    // 2. Register the human root in coordinator and grant the capabilities it can delegate.
    await coordinator.registerAgent(owner.address, 0, false);
    await coordinator.grantCapability(owner.address, await coordinator.CAN_DEPLOY());
    await coordinator.grantCapability(owner.address, await coordinator.CAN_PAY());
    await coordinator.grantCapability(owner.address, await coordinator.CAN_SUBSCRIBE());

    // 3. Create a root budget pool for the root vault (owner-controlled).
    //    The owner address must be a pool member because deployForAgent() resolves
    //    budget from pool.getVaultPool(msg.sender).
    const rootPoolId = ethers.id("root-pool-owner");
    await pool.createPool(
      rootPoolId,
      ethers.ZeroHash, // no parent = root pool
      VAULT_BUDGET,
      1, // WEEKLY
      [rootVaultAddress, owner.address],
      [],
    );

    // 4. Bootstrap agentA through the production path so it inherits the root owner.
    await registry.connect(owner).deployForAgent(
      ethers.id("agentA-vault"),
      CHILD_BUDGET,
      1, // WEEKLY
      agentA.address,
      0,
      true,
      [await coordinator.CAN_PAY(), await coordinator.CAN_SUBSCRIBE(), await coordinator.CAN_DEPLOY()],
      { gasLimit: 15_000_000 },
    );

    // 5. Create a dedicated pool for agentA so its address resolves through getVaultPool()
    //    when it later acts as the deploying operator in these tests.
    const agentAPoolId = ethers.id("agentA-pool");
    await pool.createPool(
      agentAPoolId,
      rootPoolId,
      CHILD_BUDGET,
      1,
      [agentA.address],
      [],
    );

    return { rootVaultAddress };
  }

  // ─── Test 1: Happy path ────────────────────────────────────────────────────

  it("1. Happy path — agent deploys child vault with correct ownership and event", async function () {
    await setupHumanVaultAndAgentA();

    // agentA now calls deployForAgent to deploy a vault for agentB
    const tx = await registry.connect(agentA).deployForAgent(
      ethers.id("agentB-vault"),
      ethers.parseEther("100"),
      1, // WEEKLY
      agentB.address,
      0,
      true,
      [await coordinator.CAN_PAY()],
      { gasLimit: 15_000_000 },
    );

    const receipt = await tx.wait();

    // Parse AgentVaultDeployed event
    const deployedEvent = receipt!.logs
      .map(log => { try { return registry.interface.parseLog(log as any); } catch { return null; } })
      .find(e => e?.name === "AgentVaultDeployed");

    expect(deployedEvent, "AgentVaultDeployed event must be emitted").to.not.be.undefined;
    expect(deployedEvent!.args.deployingOperator).to.equal(agentA.address);
    expect(deployedEvent!.args.rootOwner).to.equal(owner.address);
    expect(deployedEvent!.args.assignedAgent).to.equal(agentB.address);
    expect(deployedEvent!.args.budgetLimit).to.equal(ethers.parseEther("100"));

    const newVault = deployedEvent!.args.newVault;

    // The vault always belongs to the human who anchored the trust chain
    const safe = await ethers.getContractAt("AgentSafe", newVault) as AgentSafe;
    const pendingOwner = await safe.pendingOwner();
    expect(pendingOwner).to.equal(owner.address, "Vault pending owner must be the human root");

    // vaultRootOwner and vaultOperator mappings
    expect(await registry.vaultRootOwner(newVault)).to.equal(owner.address);
    expect(await registry.vaultOperator(newVault)).to.equal(agentA.address);

    // agentB is registered as operator
    expect(await coordinator.isAgentRegistered(agentB.address)).to.be.true;

    // agentB inherited the root owner
    expect(await registry.agentRootOwner(agentB.address)).to.equal(owner.address);

    // isAgentDeployed returns true
    expect(await registry.isAgentDeployed(newVault)).to.be.true;

    // getVaultsDeployedBy returns the vault
    const deployed = await registry.getVaultsDeployedBy(agentA.address);
    expect(deployed).to.include(newVault);
  });

  // ─── Test 2: Budget enforcement ───────────────────────────────────────────

  it("2. Budget enforcement — cannot allocate more than remaining pool", async function () {
    await setupHumanVaultAndAgentA();

    // agentA's pool has CHILD_BUDGET remaining (set in setupHumanVaultAndAgentA).
    // Try to deploy with more than available.
    const tooMuch = CHILD_BUDGET + ethers.parseEther("1");

    await expect(
      registry.connect(agentA).deployForAgent(
        ethers.id("overflow-vault"),
        tooMuch,
        1,
        agentB.address,
        0,
        true,
        [await coordinator.CAN_PAY()],
        { gasLimit: 15_000_000 },
      ),
    ).to.be.revertedWith("Registry: budgetLimit exceeds deployer remaining pool");
  });

  // ─── Test 3: Capability subset enforcement ────────────────────────────────

  it("3. Capability subset — cannot grant capabilities the deployer does not hold", async function () {
    await setupHumanVaultAndAgentA();

    // agentA holds CAN_PAY and CAN_SUBSCRIBE (and CAN_DEPLOY).
    // agentA tries to assign CAN_TRADE which it does NOT hold.
    await expect(
      registry.connect(agentA).deployForAgent(
        ethers.id("bad-caps-vault"),
        ethers.parseEther("50"),
        1,
        agentB.address,
        0,
        true,
        [await coordinator.CAN_PAY(), await coordinator.CAN_TRADE()], // CAN_TRADE not held by agentA
        { gasLimit: 15_000_000 },
      ),
    ).to.be.revertedWith("Registry: agentCapabilities not a subset of deployer capabilities");
  });

  // ─── Test 4: No CAN_DEPLOY without explicit grant ─────────────────────────

  it("4. No CAN_DEPLOY without grant — unregistered agent reverts", async function () {
    // stranger has no coordinator registration, no CAN_DEPLOY
    await expect(
      registry.connect(stranger).deployForAgent(
        ethers.id("stranger-vault"),
        ethers.parseEther("10"),
        1,
        agentB.address,
        0,
        false,
        [],
        { gasLimit: 15_000_000 },
      ),
    ).to.be.revertedWith("Registry: caller lacks CAN_DEPLOY");
  });

  // ─── Test 5: Root owner chain and delegation depth enforcement ────────────

  it("5. Root owner chain — getRootOwner always returns the human; depth blocks at MAX", async function () {
    await setupHumanVaultAndAgentA();

    // agentA (depth=1) deploys vault for agentB (depth=2)
    const tx2 = await registry.connect(agentA).deployForAgent(
      ethers.id("depth2-vault"),
      ethers.parseEther("80"),
      1,
      agentB.address,
      0,
      true,
      [await coordinator.CAN_PAY(), await coordinator.CAN_DEPLOY()],
      { gasLimit: 15_000_000 },
    );
    const receipt2 = await tx2.wait();
    const event2 = receipt2!.logs
      .map(log => { try { return registry.interface.parseLog(log as any); } catch { return null; } })
      .find(e => e?.name === "AgentVaultDeployed");
    const vault2 = event2!.args.newVault;

    // Check root owner is always the human
    expect(await registry.getRootOwner(vault2)).to.equal(owner.address);

    // agentB is now at depth 2 — one below MAX (3)
    expect(await coordinator.getDelegationDepth(agentB.address)).to.equal(2);

    // agentB creates a pool so it can call deployForAgent
    const agentBPoolId = ethers.id("agentB-pool");
    await pool.createPool(agentBPoolId, ethers.ZeroHash, ethers.parseEther("80"), 1, [agentB.address], []);

    // agentB (depth=2) tries to deploy for agentC (would be depth=3 = MAX_DELEGATION_DEPTH)
    // This should revert because depth 2 cannot produce depth 3 when MAX is 3
    // (the check is: getDelegationDepth(msg.sender) < MAX => 2 < 3 = true, so it passes at depth 2)
    // agentC would be depth 3 = MAX, and agentC cannot deploy further.
    await expect(
      registry.connect(agentB).deployForAgent(
        ethers.id("depth3-vault"),
        ethers.parseEther("40"),
        1,
        agentC.address,
        0,
        true,
        [], // no capabilities passed
        { gasLimit: 15_000_000 },
      ),
    ).to.not.be.reverted; // depth 2 < MAX(3), so this is allowed

    // agentC is now at depth 3 = MAX
    expect(await coordinator.getDelegationDepth(agentC.address)).to.equal(3);

    // agentC's pool
    const agentCPoolId = ethers.id("agentC-pool");
    await pool.createPool(agentCPoolId, ethers.ZeroHash, ethers.parseEther("40"), 1, [agentC.address], []);

    // Grant CAN_DEPLOY manually so this assertion isolates the depth guard rather than
    // failing earlier on the capability check.
    await coordinator.grantCapability(agentC.address, await coordinator.CAN_DEPLOY());

    // agentC (depth=3 = MAX) cannot deploy further: 3 < 3 is false → revert
    const agentD = (await ethers.getSigners())[5];
    await expect(
      registry.connect(agentC).deployForAgent(
        ethers.id("depth4-vault"),
        ethers.parseEther("10"),
        1,
        agentD.address,
        0,
        false,
        [],
        { gasLimit: 15_000_000 },
      ),
    ).to.be.revertedWith("Registry: delegation depth limit reached");
  });

  // ─── Test 6: Ownership guarantee ─────────────────────────────────────────

  it("6. Ownership guarantee — vault pending owner is human, not the deploying agent", async function () {
    await setupHumanVaultAndAgentA();

    const tx = await registry.connect(agentA).deployForAgent(
      ethers.id("ownership-check-vault"),
      ethers.parseEther("50"),
      1,
      agentB.address,
      0,
      false,
      [await coordinator.CAN_PAY()],
      { gasLimit: 15_000_000 },
    );
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map(log => { try { return registry.interface.parseLog(log as any); } catch { return null; } })
      .find(e => e?.name === "AgentVaultDeployed");
    const newVault = event!.args.newVault;

    const safe = await ethers.getContractAt("AgentSafe", newVault) as AgentSafe;

    // Pending owner is rootOwner (human), not agentA (deploying operator)
    const pendingOwner = await safe.pendingOwner();
    expect(pendingOwner).to.equal(owner.address);
    expect(pendingOwner).to.not.equal(agentA.address);

    // agentB is registered
    expect(await coordinator.isAgentRegistered(agentB.address)).to.be.true;
  });

  // ─── Test 7: Atomic revert ────────────────────────────────────────────────

  it("7. Atomic revert — duplicate assignedAgent causes full revert with no partial state", async function () {
    await setupHumanVaultAndAgentA();

    // First deployment: succeed and register agentB
    await registry.connect(agentA).deployForAgent(
      ethers.id("first-vault"),
      ethers.parseEther("50"),
      1,
      agentB.address,
      0,
      false,
      [await coordinator.CAN_PAY()],
      { gasLimit: 15_000_000 },
    );

    const deployedBefore = (await registry.getVaultsDeployedBy(agentA.address)).length;

    // Second deployment: agentB is already registered → coordinator.registerAgent reverts
    // The entire tx must revert — no new vault, no new pool, no partial state.
    await expect(
      registry.connect(agentA).deployForAgent(
        ethers.id("second-vault"),
        ethers.parseEther("50"),
        1,
        agentB.address, // already registered — triggers revert in step 8
        0,
        false,
        [await coordinator.CAN_PAY()],
        { gasLimit: 15_000_000 },
      ),
    ).to.be.revertedWith("Registry: assignedAgent already registered");

    // No new vault was logged
    const deployedAfter = (await registry.getVaultsDeployedBy(agentA.address)).length;
    expect(deployedAfter).to.equal(deployedBefore, "No vault should be added on revert");
  });
});
