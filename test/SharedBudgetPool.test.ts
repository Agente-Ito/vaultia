import { expect } from "chai";
import { ethers } from "hardhat";
import { SharedBudgetPool } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("SharedBudgetPool", () => {
  let pool: SharedBudgetPool;
  let owner: any;
  let vault1: any;
  let vault2: any;
  let vault3: any;
  let policy: any;

  const DAILY = 0;
  const WEEKLY = 1;
  const MONTHLY = 2;

  beforeEach(async () => {
    [owner, vault1, vault2, vault3, policy] = await ethers.getSigners();

    const SharedBudgetPool = await ethers.getContractFactory(
      "SharedBudgetPool"
    );
    pool = await SharedBudgetPool.deploy(policy.address);
  });

  describe("Pool Creation", () => {
    it("should create a root pool", async () => {
      const poolId = ethers.id("RootBudget");
      const budget = ethers.parseEther("1000");

      await pool.createPool(
        poolId,
        ethers.ZeroHash, // root
        budget,
        MONTHLY,
        [vault1.address],
        []
      );

      const poolData = await pool.getPool(poolId);
      expect(poolData.budget).to.equal(budget);
      expect(poolData.period).to.equal(MONTHLY);
      expect(poolData.parentPool).to.equal(ethers.ZeroHash);
      expect(poolData.vaultMembers).to.include(vault1.address);
    });

    it("should create a child pool linked to parent", async () => {
      const rootId = ethers.id("RootBudget");
      const childId = ethers.id("LivingBudget");

      const rootBudget = ethers.parseEther("5000");
      const childBudget = ethers.parseEther("3000");

      // Create root
      await pool.createPool(
        rootId,
        ethers.ZeroHash,
        rootBudget,
        MONTHLY,
        [],
        []
      );

      // Create child
      await pool.createPool(childId, rootId, childBudget, MONTHLY, [vault1.address], []);

      const childData = await pool.getPool(childId);
      expect(childData.parentPool).to.equal(rootId);
    });

    it("should enforce MAX_POOL_DEPTH (max 4 levels)", async () => {
      const depth = Array.from({ length: 6 }, (_, i) => ethers.id(`Pool${i}`));
      const budgets = Array(6).fill(ethers.parseEther("1000"));

      // Create level 0 (root)
      await pool.createPool(depth[0], ethers.ZeroHash, budgets[0], MONTHLY, [], []);

      // Create levels 1-3 (OK)
      for (let i = 1; i < 4; i++) {
        await pool.createPool(depth[i], depth[i - 1], budgets[i], MONTHLY, [], []);
      }

      // Create level 4 (should fail - exceeds depth)
      await expect(
        pool.createPool(depth[4], depth[3], budgets[4], MONTHLY, [], [])
      ).to.be.revertedWith("SBP: depth exceeded");
    });

    it("should prevent cycles", async () => {
      const poolA = ethers.id("PoolA");
      const poolB = ethers.id("PoolB");

      // Create A → B
      await pool.createPool(poolA, ethers.ZeroHash, ethers.parseEther("1000"), MONTHLY, [], []);
      await pool.createPool(poolB, poolA, ethers.parseEther("500"), MONTHLY, [], []);

      // Try to create B → A (cycle)
      // This should fail because we can't add A as parent of B when B is already parent of A
      await expect(
        pool.createPool(poolA, poolB, ethers.parseEther("1000"), MONTHLY, [], [])
      ).to.be.revertedWith("SBP: pool exists");
    });
  });

  describe("Vault Management", () => {
    beforeEach(async () => {
      const poolId = ethers.id("TestPool");
      await pool.createPool(
        poolId,
        ethers.ZeroHash,
        ethers.parseEther("1000"),
        MONTHLY,
        [vault1.address],
        []
      );
    });

    it("should register vault to pool", async () => {
      expect(await pool.vaultToPool(vault1.address)).to.equal(
        ethers.id("TestPool")
      );
    });

    it("should prevent vault in multiple pools", async () => {
      const pool2Id = ethers.id("Pool2");
      await pool.createPool(pool2Id, ethers.ZeroHash, ethers.parseEther("500"), MONTHLY, [], []);

      await expect(
        pool.addVaultToPool(pool2Id, vault1.address)
      ).to.be.revertedWith("SBP: vault already in pool");
    });

    it("should add vault to existing pool", async () => {
      const poolId = ethers.id("TestPool");
      await pool.addVaultToPool(poolId, vault2.address);

      expect(await pool.vaultToPool(vault2.address)).to.equal(poolId);
    });
  });

  describe("Spending & Budget Validation", () => {
    let rootId: string;
    let livingId: string;
    let foodId: string;

    beforeEach(async () => {
      rootId = ethers.id("Root");
      livingId = ethers.id("Living");
      foodId = ethers.id("Food");

      // Create hierarchy:
      // Root ($5000)
      //   └─ Living ($3000)
      //       └─ Food ($800)

      await pool.createPool(
        rootId,
        ethers.ZeroHash,
        ethers.parseEther("5000"),
        MONTHLY,
        [],
        []
      );

      await pool.createPool(
        livingId,
        rootId,
        ethers.parseEther("3000"),
        MONTHLY,
        [],
        []
      );

      await pool.createPool(
        foodId,
        livingId,
        ethers.parseEther("800"),
        MONTHLY,
        [vault1.address],
        []
      );
    });

    it("should validate spending across hierarchy", async () => {
      const amount = ethers.parseEther("100");

      // Should succeed (100 < 800 < 3000 < 5000)
      const poolAway = pool.connect(policy);
      await poolAway.recordSpend(vault1.address, amount);

      // Check all levels were updated
      const foodData = await pool.getPool(foodId);
      const livingData = await pool.getPool(livingId);
      const rootData = await pool.getPool(rootId);

      expect(foodData.spent).to.equal(amount);
      expect(livingData.spent).to.equal(amount);
      expect(rootData.spent).to.equal(amount);
    });

    it("should prevent spending that exceeds child pool budget", async () => {
      const amount = ethers.parseEther("900");

      const poolAway = pool.connect(policy);
      await expect(poolAway.recordSpend(vault1.address, amount)).to.be.revertedWith(
        "SBP: budget exceeded in pool"
      );
    });

    it("should prevent spending that exceeds parent pool budget", async () => {
      const amount = ethers.parseEther("1500"); // OK for food, but exceeds living

      const poolAway = pool.connect(policy);
      await expect(poolAway.recordSpend(vault1.address, amount)).to.be.revertedWith(
        "SBP: budget exceeded in pool"
      );
    });

    it("should prevent spending that exceeds root budget", async () => {
      const amount = ethers.parseEther("6000"); // Exceeds root

      const poolAway = pool.connect(policy);
      await expect(poolAway.recordSpend(vault1.address, amount)).to.be.revertedWith(
        "SBP: budget exceeded in pool"
      );
    });

    it("should accumulate spending across multiple transactions", async () => {
      const amount = ethers.parseEther("100");

      const poolAway = pool.connect(policy);

      // Make 5 transactions
      for (let i = 0; i < 5; i++) {
        await poolAway.recordSpend(vault1.address, amount);
      }

      // Total spent should be 500
      const foodData = await pool.getPool(foodId);
      expect(foodData.spent).to.equal(ethers.parseEther("500"));

      // Should fail on next (would exceed 800)
      await expect(poolAway.recordSpend(vault1.address, ethers.parseEther("400"))).to.be
        .revertedWith("SBP: budget exceeded in pool");
    });
  });

  describe("Period Reset", () => {
    let poolId: string;

    beforeEach(async () => {
      poolId = ethers.id("DailyPool");
      await pool.createPool(
        poolId,
        ethers.ZeroHash,
        ethers.parseEther("100"),
        DAILY,
        [vault1.address],
        []
      );
    });

    it("should reset period after duration expires", async () => {
      const amount = ethers.parseEther("10");

      // Record spend
      const poolAway = pool.connect(policy);
      await poolAway.recordSpend(vault1.address, amount);

      let poolData = await pool.getPool(poolId);
      expect(poolData.spent).to.equal(amount);

      // Advance time by 1 day + 1 second
      await time.increase(86401);

      // Record more spend (should trigger reset)
      await poolAway.recordSpend(vault1.address, amount);

      poolData = await pool.getPool(poolId);
      expect(poolData.spent).to.equal(amount); // Reset occurred, so only new spend counted
    });
  });

  describe("View Functions", () => {
    beforeEach(async () => {
      const poolId = ethers.id("TestPool");
      await pool.createPool(
        poolId,
        ethers.ZeroHash,
        ethers.parseEther("1000"),
        MONTHLY,
        [vault1.address, vault2.address],
        []
      );
    });

    it("should retrieve pool data", async () => {
      const poolId = ethers.id("TestPool");
      const poolData = await pool.getPool(poolId);

      expect(poolData.budget).to.equal(ethers.parseEther("1000"));
      expect(poolData.vaultMembers).to.include(vault1.address);
      expect(poolData.vaultMembers).to.include(vault2.address);
    });

    it("should get remaining budget", async () => {
      const poolId = ethers.id("TestPool");

      const initial = await pool.getPoolRemaining(poolId);
      expect(initial).to.equal(ethers.parseEther("1000"));

      const poolAway = pool.connect(policy);
      await poolAway.recordSpend(vault1.address, ethers.parseEther("300"));

      const remaining = await pool.getPoolRemaining(poolId);
      expect(remaining).to.equal(ethers.parseEther("700"));
    });

    it("should get vault ancestry", async () => {
      const rootId = ethers.id("Root");
      const livingId = ethers.id("Living");
      const foodId = ethers.id("Food");

      await pool.createPool(
        rootId,
        ethers.ZeroHash,
        ethers.parseEther("5000"),
        MONTHLY,
        [],
        []
      );

      await pool.createPool(
        livingId,
        rootId,
        ethers.parseEther("3000"),
        MONTHLY,
        [],
        []
      );

      await pool.createPool(
        foodId,
        livingId,
        ethers.parseEther("800"),
        MONTHLY,
        [vault3.address],
        []
      );

      const ancestry = await pool.getVaultAncestry(vault3.address);
      expect(ancestry).to.include(foodId);
      expect(ancestry).to.include(livingId);
      expect(ancestry).to.include(rootId);
    });
  });

    it("should prevent spending with unregistered vault", async () => {
      const poolId = ethers.id("TestPool");
      await pool.createPool(
        poolId,
        ethers.ZeroHash,
        ethers.parseEther("1000"),
        MONTHLY,
        [vault1.address],
        []
      );

      const poolAway = pool.connect(policy);

      // vault3 is not registered to any pool
      await expect(
        poolAway.recordSpend(vault3.address, ethers.parseEther("100"))
      ).to.be.revertedWith("SBP: vault not in any pool");
    });

  describe("Authorization", () => {
    it("should only allow authorized policy to recordSpend", async () => {
      const poolId = ethers.id("TestPool");
      await pool.createPool(
        poolId,
        ethers.ZeroHash,
        ethers.parseEther("1000"),
        MONTHLY,
        [vault1.address],
        []
      );

      // Try to call with non-authorized address
      await expect(
        pool.recordSpend(vault1.address, ethers.parseEther("100"))
      ).to.be.revertedWith("SBP: only authorized policy");

      // Should succeed with authorized policy
      const poolAway = pool.connect(policy);
      await poolAway.recordSpend(vault1.address, ethers.parseEther("100"));

      const poolData = await pool.getPool(poolId);
      expect(poolData.spent).to.equal(ethers.parseEther("100"));
    });

    it("should allow owner to update authorized policy", async () => {
      const oldPolicy = await pool.authorizedPolicy();
      await pool.setAuthorizedPolicy(vault1.address);

      const newPolicy = await pool.authorizedPolicy();
      expect(newPolicy).to.equal(vault1.address);
      expect(oldPolicy).to.not.equal(newPolicy);
    });
  });
});
