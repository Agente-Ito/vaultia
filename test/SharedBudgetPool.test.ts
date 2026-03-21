import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SharedBudgetPool } from "../typechain-types";

const DAILY   = 0;
const WEEKLY  = 1;
const MONTHLY = 2;

describe("SharedBudgetPool", function () {
  let pool: SharedBudgetPool;
  let owner: any;
  let vault1: any;
  let vault2: any;
  let vault3: any;
  let policy: any;
  let other: any;

  beforeEach(async function () {
    [owner, vault1, vault2, vault3, policy, other] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("SharedBudgetPool");
    pool = await Factory.deploy(policy.address) as SharedBudgetPool;
  });

  // ─── Pool Creation ───────────────────────────────────────────────────────────

  describe("Pool creation", function () {
    it("creates a root pool correctly", async function () {
      const poolId = ethers.id("Root");
      const budget = ethers.parseEther("1000");

      await pool.connect(owner).createPool(poolId, ethers.ZeroHash, budget, MONTHLY, [vault1.address], []);

      const data = await pool.getPool(poolId);
      expect(data.budget).to.equal(budget);
      expect(data.period).to.equal(MONTHLY);
      expect(data.parentPool).to.equal(ethers.ZeroHash);
      expect(data.vaultMembers).to.include(vault1.address);
      expect(await pool.vaultToPool(vault1.address)).to.equal(poolId);
    });

    it("creates a child pool linked to parent", async function () {
      const rootId  = ethers.id("Root");
      const childId = ethers.id("Child");

      await pool.connect(owner).createPool(rootId,  ethers.ZeroHash, ethers.parseEther("5000"), MONTHLY, [], []);
      await pool.connect(owner).createPool(childId, rootId,          ethers.parseEther("2000"), WEEKLY,  [vault1.address], []);

      const child = await pool.getPool(childId);
      expect(child.parentPool).to.equal(rootId);
      expect(child.vaultMembers).to.include(vault1.address);
    });

    it("rejects duplicate pool ID", async function () {
      const id = ethers.id("Dup");
      await pool.connect(owner).createPool(id, ethers.ZeroHash, ethers.parseEther("100"), DAILY, [], []);
      await expect(
        pool.connect(owner).createPool(id, ethers.ZeroHash, ethers.parseEther("200"), DAILY, [], [])
      ).to.be.revertedWith("SBPool: pool exists");
    });

    it("rejects non-existent parent", async function () {
      await expect(
        pool.connect(owner).createPool(ethers.id("Orphan"), ethers.id("Ghost"), ethers.parseEther("100"), DAILY, [], [])
      ).to.be.revertedWith("SBPool: parent not found");
    });

    it("rejects vault already in another pool", async function () {
      const id1 = ethers.id("Pool1");
      const id2 = ethers.id("Pool2");
      await pool.connect(owner).createPool(id1, ethers.ZeroHash, ethers.parseEther("100"), DAILY, [vault1.address], []);
      await expect(
        pool.connect(owner).createPool(id2, ethers.ZeroHash, ethers.parseEther("100"), DAILY, [vault1.address], [])
      ).to.be.revertedWith("SBPool: vault already in pool");
    });

    it("enforces max depth of 4", async function () {
      const ids = [ethers.id("L0"), ethers.id("L1"), ethers.id("L2"), ethers.id("L3"), ethers.id("L4")];
      const budget = ethers.parseEther("100");

      await pool.connect(owner).createPool(ids[0], ethers.ZeroHash, budget, DAILY, [], []);
      await pool.connect(owner).createPool(ids[1], ids[0],          budget, DAILY, [], []);
      await pool.connect(owner).createPool(ids[2], ids[1],          budget, DAILY, [], []);
      await pool.connect(owner).createPool(ids[3], ids[2],          budget, DAILY, [], []);

      // L4 would be depth 5 — exceeds MAX_POOL_DEPTH
      await expect(
        pool.connect(owner).createPool(ids[4], ids[3], budget, DAILY, [], [])
      ).to.be.revertedWith("SBPool: depth exceeded");
    });
  });

  // ─── recordSpend ──────────────────────────────────────────────────────────────

  describe("recordSpend", function () {
    it("only authorized policy can call recordSpend", async function () {
      const id = ethers.id("Pool");
      await pool.connect(owner).createPool(id, ethers.ZeroHash, ethers.parseEther("100"), WEEKLY, [vault1.address], []);

      await expect(
        pool.connect(other).recordSpend(vault1.address, ethers.parseEther("10"))
      ).to.be.revertedWith("SBPool: only authorized policy");
    });

    it("records spend in a single-level pool", async function () {
      const id = ethers.id("Single");
      await pool.connect(owner).createPool(id, ethers.ZeroHash, ethers.parseEther("100"), WEEKLY, [vault1.address], []);

      await pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("40"));

      const data = await pool.getPool(id);
      expect(data.spent).to.equal(ethers.parseEther("40"));
    });

    it("records spend through parent chain (hierarchy enforcement)", async function () {
      const rootId  = ethers.id("HierRoot");
      const childId = ethers.id("HierChild");

      await pool.connect(owner).createPool(rootId,  ethers.ZeroHash, ethers.parseEther("1000"), MONTHLY, [],              []);
      await pool.connect(owner).createPool(childId, rootId,          ethers.parseEther("500"),  WEEKLY,  [vault1.address], []);

      await pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("300"));

      expect((await pool.getPool(childId)).spent).to.equal(ethers.parseEther("300"));
      expect((await pool.getPool(rootId)).spent).to.equal(ethers.parseEther("300"));
    });

    it("reverts when child pool budget exceeded", async function () {
      const rootId  = ethers.id("R1");
      const childId = ethers.id("C1");

      await pool.connect(owner).createPool(rootId,  ethers.ZeroHash, ethers.parseEther("1000"), MONTHLY, [],              []);
      await pool.connect(owner).createPool(childId, rootId,          ethers.parseEther("500"),  WEEKLY,  [vault1.address], []);

      await expect(
        pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("600"))
      ).to.be.revertedWith("SBPool: budget exceeded in pool");
    });

    it("reverts when root pool budget exceeded", async function () {
      const rootId  = ethers.id("R2");
      const childId = ethers.id("C2");

      await pool.connect(owner).createPool(rootId,  ethers.ZeroHash, ethers.parseEther("400"),  MONTHLY, [],              []);
      await pool.connect(owner).createPool(childId, rootId,          ethers.parseEther("500"),  WEEKLY,  [vault1.address], []);

      // Root is only 400 but child allows 500 — root wins
      await expect(
        pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("450"))
      ).to.be.revertedWith("SBPool: budget exceeded in pool");
    });

    it("reverts for vault not in any pool", async function () {
      await expect(
        pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("10"))
      ).to.be.revertedWith("SBPool: vault not in any pool");
    });

    it("two sub-vaults share root pool budget", async function () {
      const rootId = ethers.id("SharedRoot");
      const c1Id   = ethers.id("Sub1");
      const c2Id   = ethers.id("Sub2");

      await pool.connect(owner).createPool(rootId, ethers.ZeroHash, ethers.parseEther("1000"), MONTHLY, [],              []);
      await pool.connect(owner).createPool(c1Id,   rootId,          ethers.parseEther("500"),  WEEKLY,  [vault1.address], []);
      await pool.connect(owner).createPool(c2Id,   rootId,          ethers.parseEther("500"),  WEEKLY,  [vault2.address], []);

      // Spend 400 from vault1 (sub1), then 400 from vault2 (sub2) → root total = 800
      await pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("400"));
      await pool.connect(policy).recordSpend(vault2.address, ethers.parseEther("400"));

      expect((await pool.getPool(rootId)).spent).to.equal(ethers.parseEther("800"));

      // 310 more from either vault should exceed root (800 + 310 = 1110 > 1000)
      await expect(
        pool.connect(policy).recordSpend(vault2.address, ethers.parseEther("310"))
      ).to.be.revertedWith("SBPool: budget exceeded in pool");
    });
  });

  // ─── Period resets ────────────────────────────────────────────────────────────

  describe("Period resets", function () {
    it("resets DAILY pool after 1 day", async function () {
      const id = ethers.id("DailyReset");
      await pool.connect(owner).createPool(id, ethers.ZeroHash, ethers.parseEther("100"), DAILY, [vault1.address], []);

      await pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("90"));
      expect((await pool.getPool(id)).spent).to.equal(ethers.parseEther("90"));

      await time.increase(86401); // > 1 day

      await pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("90"));
      expect((await pool.getPool(id)).spent).to.equal(ethers.parseEther("90")); // reset to 90 after reset
    });

    it("resets WEEKLY pool after 7 days", async function () {
      const id = ethers.id("WeeklyReset");
      await pool.connect(owner).createPool(id, ethers.ZeroHash, ethers.parseEther("100"), WEEKLY, [vault1.address], []);

      await pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("80"));
      await time.increase(7 * 86400 + 1);
      await pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("80"));
      expect((await pool.getPool(id)).spent).to.equal(ethers.parseEther("80"));
    });

    it("resets MONTHLY pool after 30 days", async function () {
      const id = ethers.id("MonthlyReset");
      await pool.connect(owner).createPool(id, ethers.ZeroHash, ethers.parseEther("100"), MONTHLY, [vault1.address], []);

      await pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("70"));
      await time.increase(30 * 86400 + 1);
      await pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("70"));
      expect((await pool.getPool(id)).spent).to.equal(ethers.parseEther("70"));
    });

    it("drift-corrected: late transaction doesn't shift next boundary", async function () {
      const id = ethers.id("NoDrift");
      const ts = (await ethers.provider.getBlock("latest"))!.timestamp;

      await pool.connect(owner).createPool(id, ethers.ZeroHash, ethers.parseEther("100"), WEEKLY, [vault1.address], []);

      // Advance 9 days (1 full week + 2 days)
      await time.increase(9 * 86400);

      await pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("50"));

      const data = await pool.getPool(id);
      const elapsed = Number(data.periodStart) - ts;
      // periodStart should be advanced by 7 days (no drift from the 2-day late arrival)
      expect(elapsed).to.be.closeTo(7 * 86400, 5);
    });
  });

  // ─── wouldExceedBudget ────────────────────────────────────────────────────────

  describe("wouldExceedBudget", function () {
    it("returns false when under budget", async function () {
      const id = ethers.id("WEB1");
      await pool.connect(owner).createPool(id, ethers.ZeroHash, ethers.parseEther("100"), WEEKLY, [vault1.address], []);
      expect(await pool.wouldExceedBudget(vault1.address, ethers.parseEther("50"))).to.equal(false);
    });

    it("returns true when over budget", async function () {
      const id = ethers.id("WEB2");
      await pool.connect(owner).createPool(id, ethers.ZeroHash, ethers.parseEther("100"), WEEKLY, [vault1.address], []);
      await pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("80"));
      expect(await pool.wouldExceedBudget(vault1.address, ethers.parseEther("30"))).to.equal(true);
    });

    it("returns false for vault not in any pool", async function () {
      expect(await pool.wouldExceedBudget(other.address, ethers.parseEther("1"))).to.equal(false);
    });
  });

  // ─── getVaultAncestry ─────────────────────────────────────────────────────────

  describe("getVaultAncestry", function () {
    it("returns full ancestry chain", async function () {
      const ids = [ethers.id("A0"), ethers.id("A1"), ethers.id("A2")];
      const budget = ethers.parseEther("100");

      await pool.connect(owner).createPool(ids[0], ethers.ZeroHash, budget, DAILY, [],              []);
      await pool.connect(owner).createPool(ids[1], ids[0],          budget, DAILY, [],              []);
      await pool.connect(owner).createPool(ids[2], ids[1],          budget, DAILY, [vault1.address], []);

      const ancestry = await pool.getVaultAncestry(vault1.address);
      expect(ancestry.length).to.equal(3);
      expect(ancestry[0]).to.equal(ids[2]);
      expect(ancestry[1]).to.equal(ids[1]);
      expect(ancestry[2]).to.equal(ids[0]);
    });
  });

  // ─── Pool remaining ───────────────────────────────────────────────────────────

  describe("getPoolRemaining", function () {
    it("returns correct remaining budget", async function () {
      const id = ethers.id("Rem");
      await pool.connect(owner).createPool(id, ethers.ZeroHash, ethers.parseEther("100"), WEEKLY, [vault1.address], []);
      await pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("30"));
      expect(await pool.getPoolRemaining(id)).to.equal(ethers.parseEther("70"));
    });

    it("returns 0 when fully spent", async function () {
      const id = ethers.id("Zero");
      await pool.connect(owner).createPool(id, ethers.ZeroHash, ethers.parseEther("50"), WEEKLY, [vault1.address], []);
      await pool.connect(policy).recordSpend(vault1.address, ethers.parseEther("50"));
      expect(await pool.getPoolRemaining(id)).to.equal(0);
    });
  });

  // ─── Access control ───────────────────────────────────────────────────────────

  describe("Access control", function () {
    it("only owner can create pools", async function () {
      await expect(
        pool.connect(other).createPool(ethers.id("X"), ethers.ZeroHash, ethers.parseEther("100"), DAILY, [], [])
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("owner can change authorized policy", async function () {
      await pool.connect(owner).setAuthorizedPolicy(other.address);
      expect(await pool.authorizedPolicy()).to.equal(other.address);
    });
  });
});
