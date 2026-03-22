import { expect } from "chai";
import { ethers } from "hardhat";
import { TaskScheduler } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("TaskScheduler", () => {
  let scheduler: TaskScheduler;
  let owner: any;
  let keeper1: any;
  let keeper2: any;
  let keyManager: any;
  let ownerVault: any;
  let keeperVault: any;

  const TIMESTAMP = 0;
  const BLOCK_NUMBER = 1;
  const sampleCalldata = "0x00";

  beforeEach(async () => {
    [owner, keeper1, keeper2, keyManager] = await ethers.getSigners();

    const TaskScheduler = await ethers.getContractFactory("TaskScheduler");
    scheduler = await TaskScheduler.deploy();

    const MockOwnedVault = await ethers.getContractFactory("MockOwnedVault");
    ownerVault = await MockOwnedVault.deploy(owner.address);
    keeperVault = await MockOwnedVault.deploy(keeper1.address);
  });

  describe("Task Creation", () => {
    it("should create a TIMESTAMP-based task", async () => {
      const taskId = ethers.id("GroceryPayment");
      const futureTime = await time.latest() + 86400;

      await scheduler.createTask(
        taskId,
        await ownerVault.getAddress(),
        keyManager.address,
        sampleCalldata,
        TIMESTAMP,
        futureTime,
        604800
      );

      const task = await scheduler.getTask(taskId);
      expect(task.triggerType).to.equal(TIMESTAMP);
      expect(task.nextExecution).to.equal(futureTime);
      expect(task.interval).to.equal(604800);
      expect(task.enabled).to.be.true;
    });

    it("should create a BLOCK_NUMBER-based task", async () => {
      const taskId = ethers.id("RebalanceTask");
      const futureBlock = (await ethers.provider.getBlockNumber()) + 1000;

      await scheduler.createTask(
        taskId,
        await ownerVault.getAddress(),
        keyManager.address,
        sampleCalldata,
        BLOCK_NUMBER,
        futureBlock,
        2000
      );

      const task = await scheduler.getTask(taskId);
      expect(task.triggerType).to.equal(BLOCK_NUMBER);
      expect(task.nextExecution).to.equal(futureBlock);
      expect(task.interval).to.equal(2000);
    });

    it("should prevent duplicate task IDs", async () => {
      const taskId = ethers.id("DuplicateTask");
      const futureTime = await time.latest() + 86400;

      await scheduler.createTask(
        taskId,
        await ownerVault.getAddress(),
        keyManager.address,
        sampleCalldata,
        TIMESTAMP,
        futureTime,
        86400
      );

      await expect(
        scheduler.createTask(
          taskId,
          await ownerVault.getAddress(),
          keyManager.address,
          sampleCalldata,
          TIMESTAMP,
          futureTime,
          86400
        )
      ).to.be.revertedWith("TS: task already exists");
    });

    it("should validate parameters", async () => {
      const taskId = ethers.id("Task");
      const futureTime = await time.latest() + 86400;

      await expect(
        scheduler.createTask(
          taskId,
          ethers.ZeroAddress,
          keyManager.address,
          sampleCalldata,
          TIMESTAMP,
          futureTime,
          86400
        )
      ).to.be.revertedWith("TS: invalid vault");

      await expect(
        scheduler.createTask(
          taskId,
          await ownerVault.getAddress(),
          ethers.ZeroAddress,
          sampleCalldata,
          TIMESTAMP,
          futureTime,
          86400
        )
      ).to.be.revertedWith("TS: invalid keyManager");

      await expect(
        scheduler.createTask(
          taskId,
          await ownerVault.getAddress(),
          keyManager.address,
          sampleCalldata,
          TIMESTAMP,
          futureTime,
          0
        )
      ).to.be.revertedWith("TS: invalid interval");
    });

    it("should reject vaults without an owner() interface", async () => {
      const taskId = ethers.id("EOATask");
      const futureTime = await time.latest() + 86400;

      await expect(
        scheduler.createTask(
          taskId,
          keeper2.address,
          keyManager.address,
          sampleCalldata,
          TIMESTAMP,
          futureTime,
          86400
        )
      ).to.be.revertedWith("TS: vault owner unavailable");
    });
  });

  describe("Task Execution - TIMESTAMP Trigger", () => {
    let taskId: string;

    beforeEach(async () => {
      taskId = ethers.id("SubscriptionPayment");
      const futureTime = (await time.latest()) + 100;

      await scheduler.createTask(
        taskId,
        await ownerVault.getAddress(),
        keyManager.address,
        sampleCalldata,
        TIMESTAMP,
        futureTime,
        100
      );
    });

    it("should report not executable before time", async () => {
      const executable = await scheduler.isExecutable(taskId);
      expect(executable).to.be.false;
    });

    it("should check time until execution", async () => {
      const timeUntil = await scheduler.getTimeUntilExecutable(taskId);
      expect(Number(timeUntil)).to.be.greaterThan(0);
    });

    it("should show executable after time passes", async () => {
      await time.increase(110);

      const executable = await scheduler.isExecutable(taskId);
      expect(executable).to.be.true;

      const timeUntil = await scheduler.getTimeUntilExecutable(taskId);
      expect(Number(timeUntil)).to.be.lessThanOrEqual(0);
    });
  });

  describe("Task Execution - BLOCK_NUMBER Trigger", () => {
    let taskId: string;
    let futureBlock: number;

    beforeEach(async () => {
      taskId = ethers.id("RebalanceTask");
      futureBlock = (await ethers.provider.getBlockNumber()) + 10;

      await scheduler.createTask(
        taskId,
        await ownerVault.getAddress(),
        keyManager.address,
        sampleCalldata,
        BLOCK_NUMBER,
        futureBlock,
        10
      );
    });

    it("should prevent execution before block", async () => {
      await expect(scheduler.executeTask(taskId)).to.be.revertedWith("TS: not executable yet");
    });

    it("should show blocks until execution", async () => {
      const blocksUntil = await scheduler.getBlocksUntilExecutable(taskId);
      expect(Number(blocksUntil)).to.be.greaterThan(0);
    });
  });

  describe("Task Management", () => {
    let taskId: string;
    let futureTime: number;

    beforeEach(async () => {
      taskId = ethers.id("ManageTask");
      futureTime = await time.latest() + 1000;

      await scheduler.createTask(
        taskId,
        await ownerVault.getAddress(),
        keyManager.address,
        sampleCalldata,
        TIMESTAMP,
        futureTime,
        86400
      );
    });

    it("should disable a task", async () => {
      let task = await scheduler.getTask(taskId);
      expect(task.enabled).to.be.true;

      await scheduler.disableTask(taskId);

      task = await scheduler.getTask(taskId);
      expect(task.enabled).to.be.false;
    });

    it("should enable a disabled task", async () => {
      await scheduler.disableTask(taskId);
      await scheduler.enableTask(taskId);

      const task = await scheduler.getTask(taskId);
      expect(task.enabled).to.be.true;
    });

    it("should prevent execution of disabled tasks", async () => {
      await time.increase(2000);
      await scheduler.disableTask(taskId);

      await expect(scheduler.executeTask(taskId)).to.be.revertedWith("TS: task disabled");
    });

    it("should update task execution time and interval", async () => {
      const newTime = futureTime + 10000;
      const newInterval = 172800;

      await scheduler.updateTask(taskId, newTime, newInterval);

      const task = await scheduler.getTask(taskId);
      expect(task.nextExecution).to.equal(newTime);
      expect(task.interval).to.equal(newInterval);
    });

    it("should delete a task", async () => {
      await scheduler.deleteTask(taskId);
      await expect(scheduler.getTask(taskId)).to.be.revertedWith("TS: task not found");
      expect(await scheduler.getTaskCount()).to.equal(0);
    });
  });

  describe("Keeper Whitelist", () => {
    let taskId: string;

    beforeEach(async () => {
      taskId = ethers.id("KeeperTask");
      const futureTime = await time.latest() + 100;

      await scheduler.createTask(
        taskId,
        await ownerVault.getAddress(),
        keyManager.address,
        sampleCalldata,
        TIMESTAMP,
        futureTime,
        100
      );
    });

    it("should enable whitelist and trust the owner by default", async () => {
      const enabled = await scheduler.keeperWhitelistEnabled();
      expect(enabled).to.be.true;
      expect(await scheduler.isWhitelistedKeeper(owner.address)).to.be.true;
    });

    it("should block non-whitelisted keepers by default", async () => {
      await time.increase(200);
      await expect(scheduler.connect(keeper2).executeTask(taskId)).to.be.revertedWith("TS: keeper not whitelisted");
    });

    it("should restrict execution to whitelisted keepers when enabled", async () => {
      await scheduler.addKeeper(keeper1.address);
      expect(await scheduler.isWhitelistedKeeper(keeper1.address)).to.be.true;
      expect(await scheduler.isWhitelistedKeeper(keeper2.address)).to.be.false;
    });

    it("should manage keeper whitelist", async () => {
      await scheduler.addKeeper(keeper1.address);
      expect(await scheduler.isWhitelistedKeeper(keeper1.address)).to.be.true;
      await scheduler.removeKeeper(keeper1.address);
      expect(await scheduler.isWhitelistedKeeper(keeper1.address)).to.be.false;
    });
  });

  describe("View Functions", () => {
    beforeEach(async () => {
      const currentChainTime = await time.latest();
      const futureTime = currentChainTime + 1000;

      for (let i = 0; i < 3; i++) {
        const taskId = ethers.id(`Task${i}`);
        await scheduler.createTask(
          taskId,
          await ownerVault.getAddress(),
          keyManager.address,
          sampleCalldata,
          TIMESTAMP,
          futureTime + i * 1000,
          86400
        );
      }
    });

    it("should get task count", async () => {
      const count = await scheduler.getTaskCount();
      expect(count).to.equal(3);
    });

    it("should get task IDs with pagination", async () => {
      const taskIds = await scheduler.getTaskIds(0, 10);
      expect(taskIds.length).to.equal(3);
    });

    it("should get eligible tasks", async () => {
      let eligible = await scheduler.getEligibleTasks();
      expect(eligible.length).to.equal(0);

      await time.increase(4000);
      eligible = await scheduler.getEligibleTasks();
      expect(eligible.length).to.equal(3);
    });

    it("should get tasks for a specific vault", async () => {
      const futureTime = await time.latest() + 1000;

      await scheduler.connect(keeper1).createTask(
        ethers.id("OtherTask"),
        await keeperVault.getAddress(),
        keyManager.address,
        sampleCalldata,
        TIMESTAMP,
        futureTime,
        86400
      );

      const ownerVaultTasks = await scheduler.getTasksForVault(await ownerVault.getAddress());
      expect(ownerVaultTasks.length).to.equal(3);

      const otherTasks = await scheduler.getTasksForVault(await keeperVault.getAddress());
      expect(otherTasks.length).to.equal(1);
    });
  });

  describe("Authorization", () => {
    it("should allow a vault owner to create tasks even when not scheduler owner", async () => {
      const taskId = ethers.id("KeeperOwnedTask");
      const futureTime = await time.latest() + 1000;

      await expect(
        scheduler.connect(keeper1).createTask(
          taskId,
          await keeperVault.getAddress(),
          keyManager.address,
          sampleCalldata,
          TIMESTAMP,
          futureTime,
          86400
        )
      ).to.not.be.reverted;
    });

    it("should block non-vault-owner task creation", async () => {
      const taskId = ethers.id("UnauthorizedTask");
      const futureTime = await time.latest() + 1000;

      await expect(
        scheduler.connect(keeper1).createTask(
          taskId,
          await ownerVault.getAddress(),
          keyManager.address,
          sampleCalldata,
          TIMESTAMP,
          futureTime,
          86400
        )
      ).to.be.revertedWith("TS: caller is not vault owner");
    });

    it("should only allow the associated vault owner to manage tasks", async () => {
      const taskId = ethers.id("ManageTask");
      const futureTime = await time.latest() + 1000;

      await scheduler.connect(keeper1).createTask(
        taskId,
        await keeperVault.getAddress(),
        keyManager.address,
        sampleCalldata,
        TIMESTAMP,
        futureTime,
        86400
      );

      await expect(scheduler.disableTask(taskId)).to.be.revertedWith("TS: caller is not vault owner");
      await expect(scheduler.connect(keeper1).disableTask(taskId)).to.not.be.reverted;
    });

    it("should keep keeper admin under scheduler owner", async () => {
      await expect(
        scheduler.connect(keeper1).addKeeper(keeper2.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
