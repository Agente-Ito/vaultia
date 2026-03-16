import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentCoordinator } from "../typechain-types";

describe("AgentCoordinator", () => {
  let coordinator: AgentCoordinator;
  let owner: any;
  let agent1: any;
  let agent2: any;
  let agent3: any;

  const GROCERY_AGENT = ethers.id("GROCERY_AGENT");
  const SUBSCRIPTION_AGENT = ethers.id("SUBSCRIPTION_AGENT");

  beforeEach(async () => {
    [owner, agent1, agent2, agent3] = await ethers.getSigners();

    const AgentCoordinator = await ethers.getContractFactory("AgentCoordinator");
    coordinator = await AgentCoordinator.deploy();
  });

  describe("Agent Registration", () => {
    it("should register an EOA agent", async () => {
      await coordinator.registerAgent(agent1.address, 0, true);

      const config = await coordinator.agents(agent1.address);
      expect(config.isContract).to.be.false;
      expect(config.maxGasPerCall).to.equal(0);
      expect(config.allowedAutomation).to.be.true;
    });

    it("should register a contract agent with gas limits", async () => {
      // Deploy a dummy contract to use as an agent
      const Dummy = await ethers.getContractFactory("AgentCoordinator");
      const dummy = await Dummy.deploy();
      const dummyAddress = await dummy.getAddress();

      await coordinator.registerAgent(dummyAddress, 500000, true);

      const config = await coordinator.agents(dummyAddress);
      expect(config.isContract).to.be.true;
      expect(config.maxGasPerCall).to.equal(500000);
      expect(config.allowedAutomation).to.be.true;
    });

    it("should prevent duplicate registration", async () => {
      await coordinator.registerAgent(agent1.address, 0, true);

      await expect(
        coordinator.registerAgent(agent1.address, 0, true)
      ).to.be.reverted;
    });

    it("should allow updating gas limits", async () => {
      await coordinator.registerAgent(agent1.address, 0, false);
      await coordinator.setMaxGasPerCall(agent1.address, 300000);

      const config = await coordinator.agents(agent1.address);
      expect(config.maxGasPerCall).to.equal(300000);
    });
  });

  describe("Role Management", () => {
    beforeEach(async () => {
      await coordinator.registerAgent(agent1.address, 0, true);
      await coordinator.registerAgent(agent2.address, 0, true);
    });

    it("should assign a role to an agent", async () => {
      const capabilities = [
        ethers.id("CAN_PAY"),
        ethers.id("CAN_SUBSCRIBE"),
      ];

      await coordinator.assignRole(agent1.address, GROCERY_AGENT, capabilities);

      expect(await coordinator.hasRole(agent1.address, GROCERY_AGENT)).to.be
        .true;
    });

    it("should track agent roles", async () => {
      await coordinator.assignRole(agent1.address, GROCERY_AGENT, []);
      await coordinator.assignRole(agent1.address, SUBSCRIPTION_AGENT, []);

      const roles = await coordinator.getAgentRoles(agent1.address);
      expect(roles).to.include(GROCERY_AGENT);
      expect(roles).to.include(SUBSCRIPTION_AGENT);
    });

    it("should revoke a role", async () => {
      await coordinator.assignRole(agent1.address, GROCERY_AGENT, []);
      await coordinator.revokeRole(agent1.address, GROCERY_AGENT);

      expect(await coordinator.hasRole(agent1.address, GROCERY_AGENT)).to.be
        .false;
    });

    it("should track role members", async () => {
      await coordinator.assignRole(agent1.address, GROCERY_AGENT, []);
      await coordinator.assignRole(agent2.address, GROCERY_AGENT, []);

      const members = await coordinator.getRoleMembers(GROCERY_AGENT);
      expect(members).to.include(agent1.address);
      expect(members).to.include(agent2.address);
    });
  });

  describe("Capability Management", () => {
    beforeEach(async () => {
      await coordinator.registerAgent(agent1.address, 0, true);
    });

    it("should grant a capability", async () => {
      const CAN_PAY = ethers.id("CAN_PAY");
      await coordinator.grantCapability(agent1.address, CAN_PAY);

      expect(await coordinator.hasCapability(agent1.address, CAN_PAY)).to.be
        .true;
    });

    it("should revoke a capability", async () => {
      const CAN_PAY = ethers.id("CAN_PAY");
      await coordinator.grantCapability(agent1.address, CAN_PAY);
      await coordinator.revokeCapability(agent1.address, CAN_PAY);

      expect(await coordinator.hasCapability(agent1.address, CAN_PAY)).to.be
        .false;
    });

    it("should support multiple capabilities per agent", async () => {
      const CAN_PAY = ethers.id("CAN_PAY");
      const CAN_TRADE = ethers.id("CAN_TRADE");
      const CAN_TRANSFER = ethers.id("CAN_TRANSFER");

      await coordinator.grantCapability(agent1.address, CAN_PAY);
      await coordinator.grantCapability(agent1.address, CAN_TRADE);
      await coordinator.grantCapability(agent1.address, CAN_TRANSFER);

      expect(await coordinator.hasCapability(agent1.address, CAN_PAY)).to.be
        .true;
      expect(await coordinator.hasCapability(agent1.address, CAN_TRADE)).to.be
        .true;
      expect(await coordinator.hasCapability(agent1.address, CAN_TRANSFER)).to
        .be.true;
    });
  });

  describe("Role Admin", () => {
    it("should allow owner to change role admin", async () => {
      const oldAdmin = await coordinator.roleAdmin();
      await coordinator.setRoleAdmin(agent1.address);

      const newAdmin = await coordinator.roleAdmin();
      expect(newAdmin).to.equal(agent1.address);
      expect(oldAdmin).to.not.equal(newAdmin);
    });

    it("should restrict role operations to role admin", async () => {
      await coordinator.registerAgent(agent2.address, 0, true);
      await coordinator.setRoleAdmin(agent1.address);

      // owner can no longer assign roles
      await expect(
        coordinator.assignRole(agent2.address, GROCERY_AGENT, [])
      ).to.be.revertedWith("AC: only roleAdmin");

      // agent1 (new admin) can assign roles
      const coordinatorAsAgent1 = coordinator.connect(agent1);
      await coordinatorAsAgent1.assignRole(agent2.address, GROCERY_AGENT, []);

      expect(await coordinator.hasRole(agent2.address, GROCERY_AGENT)).to.be
        .true;
    });
  });

  describe("View Functions", () => {
    it("should get agent configuration", async () => {
      await coordinator.registerAgent(agent1.address, 500000, true);

      const config = await coordinator.getAgentConfig(agent1.address);
      expect(config.maxGasPerCall).to.equal(500000);
      expect(config.allowedAutomation).to.be.true;
    });

    it("should identify contract agents", async () => {
      const Dummy = await ethers.getContractFactory("AgentCoordinator");
      const dummy = await Dummy.deploy();
      const dummyAddress = await dummy.getAddress();

      await coordinator.registerAgent(agent1.address, 0, true);
      await coordinator.registerAgent(dummyAddress, 500000, true);

      expect(await coordinator.isContractAgent(agent1.address)).to.be.false;
      expect(await coordinator.isContractAgent(dummyAddress)).to.be.true;
    });

    it("should check automation eligibility", async () => {
      await coordinator.registerAgent(agent1.address, 0, true);
      await coordinator.registerAgent(agent2.address, 0, false);

      expect(await coordinator.canBeAutomated(agent1.address)).to.be.true;
      expect(await coordinator.canBeAutomated(agent2.address)).to.be.false;
    });
  });
});
