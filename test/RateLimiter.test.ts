import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { RateLimiter } from "../typechain-types";

describe("RateLimiter — Rate Limiting Utility", function () {
  let owner: SignerWithAddress;
  let agent1: SignerWithAddress;
  let agent2: SignerWithAddress;
  let rl: RateLimiter;

  beforeEach(async function () {
    [owner, agent1, agent2] = await ethers.getSigners();

    const RLFactory = await ethers.getContractFactory("RateLimiter");
    rl = await RLFactory.deploy(owner.address);
  });

  afterEach(async function () {
    // Always restore automine in case a test failed mid-execution with it disabled.
    await ethers.provider.send("evm_setAutomine", [true]);
  });

  // Helper: batch N transactions in a single block, returns responses in order
  async function batchInOneBlock(promises: Promise<any>[]): Promise<any[]> {
    await ethers.provider.send("evm_setAutomine", [false]);
    const responses = await Promise.all(promises);
    await ethers.provider.send("evm_mine", []);
    await ethers.provider.send("evm_setAutomine", [true]);
    return responses;
  }

  describe("Rate Limiting", function () {
    it("should allow up to maxCallsPerBlock calls", async function () {
      const calls = Array.from({ length: 10 }, () => rl.checkRateLimit(agent1.address));
      await batchInOneBlock(calls);
      expect(await rl.callsInBlock(agent1.address)).to.equal(10);
    });

    it("should reject calls exceeding limit", async function () {
      // Send 11 calls to the same block. Exactly 10 should succeed and 1 should fail.
      // We assert on counts rather than positional order because concurrent nonce assignment
      // may not guarantee that the array index matches the in-block execution order.
      await ethers.provider.send("evm_setAutomine", [false]);
      const txPromises = Array.from({ length: 11 }, () => rl.checkRateLimit(agent1.address));
      const responses = await Promise.all(txPromises);
      await ethers.provider.send("evm_mine", []);
      await ethers.provider.send("evm_setAutomine", [true]);

      const receipts = await Promise.all(
        responses.map((r) => ethers.provider.getTransactionReceipt(r.hash))
      );
      const successCount = receipts.filter((r) => r !== null && r.status === 1).length;
      const failCount = receipts.filter((r) => r === null || r.status === 0).length;

      expect(successCount).to.equal(10, "Expected exactly 10 successful transactions");
      expect(failCount).to.equal(1, "Expected exactly 1 failed transaction (rate limit exceeded)");
      expect(await rl.callsInBlock(agent1.address)).to.equal(10);
    });

    it("should track agents independently", async function () {
      const calls = [];
      for (let i = 0; i < 5; i++) {
        calls.push(rl.checkRateLimit(agent1.address));
        calls.push(rl.checkRateLimit(agent2.address));
      }
      await batchInOneBlock(calls);

      expect(await rl.callsInBlock(agent1.address)).to.equal(5);
      expect(await rl.callsInBlock(agent2.address)).to.equal(5);
    });

    it("should reset counter in new block", async function () {
      // Fill block N with 10 calls
      await batchInOneBlock(Array.from({ length: 10 }, () => rl.checkRateLimit(agent1.address)));
      expect(await rl.callsInBlock(agent1.address)).to.equal(10);

      // Mine an empty block (advance block number)
      await ethers.provider.send("hardhat_mine", ["1"]);

      // Counter resets LAZILY on the next call in the new block — goes to 1, not 0
      await rl.checkRateLimit(agent1.address);
      expect(await rl.callsInBlock(agent1.address)).to.equal(1);
    });
  });

  describe("View Functions", function () {
    it("wouldExceedRateLimit should predict correctly", async function () {
      // Initially should not exceed (no prior calls)
      let exceeds = await rl.wouldExceedRateLimit(agent1.address);
      expect(exceeds).to.be.false;

      // Fill exactly to limit in one block
      await ethers.provider.send("evm_setAutomine", [false]);
      for (let i = 0; i < 10; i++) {
        await rl.checkRateLimit(agent1.address);
      }
      await ethers.provider.send("evm_mine", []);
      await ethers.provider.send("evm_setAutomine", [true]);

      // Now adding one more would exceed
      exceeds = await rl.wouldExceedRateLimit(agent1.address);
      expect(exceeds).to.be.true;
    });

    it("getRemainingCallsInBlock should return correct count", async function () {
      // No calls yet — full limit available
      let remaining = await rl.getRemainingCallsInBlock(agent1.address);
      expect(remaining).to.equal(10);

      // Make 5 calls in same block
      await ethers.provider.send("evm_setAutomine", [false]);
      for (let i = 0; i < 5; i++) {
        await rl.checkRateLimit(agent1.address);
      }
      await ethers.provider.send("evm_mine", []);
      await ethers.provider.send("evm_setAutomine", [true]);

      remaining = await rl.getRemainingCallsInBlock(agent1.address);
      expect(remaining).to.equal(5);
    });
  });

  describe("Configuration", function () {
    it("should allow owner to update max calls", async function () {
      await rl.setMaxCallsPerBlock(5);
      expect(await rl.maxCallsPerBlock()).to.equal(5);

      // 6 calls in one block — exactly 5 should succeed, 1 should fail
      await ethers.provider.send("evm_setAutomine", [false]);
      const txPromises = Array.from({ length: 6 }, () => rl.checkRateLimit(agent1.address));
      const responses = await Promise.all(txPromises);
      await ethers.provider.send("evm_mine", []);
      await ethers.provider.send("evm_setAutomine", [true]);

      const receipts = await Promise.all(
        responses.map((r) => ethers.provider.getTransactionReceipt(r.hash))
      );
      const successCount = receipts.filter((r) => r !== null && r.status === 1).length;
      const failCount = receipts.filter((r) => r === null || r.status === 0).length;
      expect(successCount).to.equal(5, "Expected exactly 5 successful transactions");
      expect(failCount).to.equal(1, "Expected exactly 1 failed transaction (rate limit exceeded)");
    });

    it("should emit events", async function () {
      await expect(rl.setMaxCallsPerBlock(15))
        .to.emit(rl, "MaxCallsPerBlockUpdated");

      await expect(rl.enableRateLimitingForVault(agent1.address))
        .to.emit(rl, "RateLimitingEnabledForVault");

      await expect(rl.checkRateLimit(agent1.address))
        .to.emit(rl, "RateLimitCheckPassed");
    });
  });

  describe("Security", function () {
    it("should reject zero agent", async function () {
      await expect(rl.checkRateLimit(ethers.ZeroAddress)).to.be.revertedWith("RL: zero agent");
    });

    it("should reject zero vault", async function () {
      await expect(rl.enableRateLimitingForVault(ethers.ZeroAddress)).to.be.revertedWith("RL: zero vault");
    });

    it("should reject invalid limit", async function () {
      await expect(rl.setMaxCallsPerBlock(0)).to.be.revertedWith("RL: invalid limit");
    });
  });
});
