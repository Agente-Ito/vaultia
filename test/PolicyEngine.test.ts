import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { PolicyEngine, BudgetPolicy, MerchantPolicy, ExpirationPolicy, AgentSafe } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("PolicyEngine", function () {
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let merchant: SignerWithAddress;
  let attacker: SignerWithAddress;
  let safe: AgentSafe;
  let pe: PolicyEngine;
  let budget: BudgetPolicy;

  const BUDGET = ethers.parseEther("100");

  beforeEach(async function () {
    [owner, agent, merchant, attacker] = await ethers.getSigners();

    const AgentSafeFactory = await ethers.getContractFactory("AgentSafe");
    safe = await AgentSafeFactory.deploy(owner.address);

    const PolicyEngineFactory = await ethers.getContractFactory("PolicyEngine");
    pe = await PolicyEngineFactory.deploy(owner.address, await safe.getAddress());

    const BudgetPolicyFactory = await ethers.getContractFactory("BudgetPolicy");
    budget = await BudgetPolicyFactory.deploy(
      owner.address,
      await pe.getAddress(),
      BUDGET,
      0, // DAILY
      ethers.ZeroAddress
    );
  });

  describe("onlySafe guard", function () {
    it("should reject validate() called by non-safe address", async function () {
      await expect(
        pe.validate(agent.address, ethers.ZeroAddress, merchant.address, 100n, "0x")
      ).to.be.revertedWith("PE: only safe");
    });

    it("should reject validate() called by attacker", async function () {
      await expect(
        pe.connect(attacker).validate(agent.address, ethers.ZeroAddress, merchant.address, 100n, "0x")
      ).to.be.revertedWith("PE: only safe");
    });
  });

  describe("addPolicy", function () {
    it("should add a policy", async function () {
      await pe.addPolicy(await budget.getAddress());
      const policies = await pe.getPolicies();
      expect(policies).to.include(await budget.getAddress());
    });

    it("should reject duplicate policy", async function () {
      await pe.addPolicy(await budget.getAddress());
      await expect(
        pe.addPolicy(await budget.getAddress())
      ).to.be.revertedWith("PE: duplicate");
    });

    it("should reject zero address policy", async function () {
      await expect(
        pe.addPolicy(ethers.ZeroAddress)
      ).to.be.revertedWith("PE: zero address");
    });

    it("should enforce MAX_POLICIES = 20", async function () {
      const BudgetPolicyFactory = await ethers.getContractFactory("BudgetPolicy");
      // Add 20 distinct policies
      for (let i = 0; i < 20; i++) {
        const bp = await BudgetPolicyFactory.deploy(
          owner.address,
          await pe.getAddress(),
          BUDGET + BigInt(i),
          0,
          ethers.ZeroAddress
        );
        await pe.addPolicy(await bp.getAddress());
      }
      const extra = await BudgetPolicyFactory.deploy(
        owner.address,
        await pe.getAddress(),
        BUDGET,
        0,
        ethers.ZeroAddress
      );
      await expect(
        pe.addPolicy(await extra.getAddress())
      ).to.be.revertedWith("PE: max policies reached");
    });
  });

  describe("removePolicy", function () {
    it("should remove a policy", async function () {
      await pe.addPolicy(await budget.getAddress());
      await pe.removePolicy(0);
      const policies = await pe.getPolicies();
      expect(policies).to.not.include(await budget.getAddress());
      expect(await pe.isPolicy(await budget.getAddress())).to.be.false;
    });

    it("should emit PolicyRemoved with both index and policy address", async function () {
      const budgetAddr = await budget.getAddress();
      await pe.addPolicy(budgetAddr);
      await expect(pe.removePolicy(0))
        .to.emit(pe, "PolicyRemoved")
        .withArgs(0, budgetAddr);
    });

    it("should revert out-of-bounds removal", async function () {
      await expect(pe.removePolicy(0)).to.be.revertedWith("PE: out of bounds");
    });
  });
});

describe("BudgetPolicy", function () {
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let merchant: SignerWithAddress;
  let safe: AgentSafe;
  let pe: PolicyEngine;
  let budget: BudgetPolicy;

  const BUDGET = ethers.parseEther("100");

  beforeEach(async function () {
    [owner, agent, merchant] = await ethers.getSigners();

    const AgentSafeFactory = await ethers.getContractFactory("AgentSafe");
    safe = await AgentSafeFactory.deploy(owner.address);

    const PolicyEngineFactory = await ethers.getContractFactory("PolicyEngine");
    pe = await PolicyEngineFactory.deploy(owner.address, await safe.getAddress());

    const BudgetPolicyFactory = await ethers.getContractFactory("BudgetPolicy");
    budget = await BudgetPolicyFactory.deploy(
      owner.address,
      await pe.getAddress(),
      BUDGET,
      0, // DAILY
      ethers.ZeroAddress
    );

    await pe.addPolicy(await budget.getAddress());
    await safe.setPolicyEngine(await pe.getAddress());
    await safe.setKeyManager(agent.address);
    await owner.sendTransaction({ to: await safe.getAddress(), value: ethers.parseEther("200") });
  });

  it("should block direct validate() calls", async function () {
    await expect(
      budget.validate(agent.address, ethers.ZeroAddress, merchant.address, 100n, "0x")
    ).to.be.revertedWith("BP: only PolicyEngine");
  });

  it("should reject budget > 0 in constructor", async function () {
    const BudgetPolicyFactory = await ethers.getContractFactory("BudgetPolicy");
    await expect(
      BudgetPolicyFactory.deploy(owner.address, await pe.getAddress(), 0, 0, ethers.ZeroAddress)
    ).to.be.revertedWith("BP: budget must be > 0");
  });

  it("should track cumulative spend across multiple payments", async function () {
    await safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("30"), "0x");
    await safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("30"), "0x");
    expect(await budget.spent()).to.equal(ethers.parseEther("60"));
    await expect(
      safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("41"), "0x")
    ).to.be.revertedWith("BP: budget exceeded");
  });

  it("should reset spend after period duration (DAILY)", async function () {
    await safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("90"), "0x");
    expect(await budget.spent()).to.equal(ethers.parseEther("90"));

    // Advance time by 1 day
    await time.increase(86400 + 1);

    // After reset, spent should be 0 and we can spend again
    await safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("50"), "0x");
    expect(await budget.spent()).to.equal(ethers.parseEther("50"));
  });

  it("should not drift periodStart when reset triggered late", async function () {
    const initialPeriodStart = await budget.periodStart();

    // Advance 1 day + 2 hours (late trigger)
    await time.increase(86400 + 7200);

    // Trigger a reset via a spend
    await safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("1"), "0x");

    const newPeriodStart = await budget.periodStart();
    // periodStart must advance by exactly 1 day, not by (1 day + 2 hours)
    expect(newPeriodStart).to.equal(initialPeriodStart + BigInt(86400));
  });

  it("should emit BudgetSpent event", async function () {
    await expect(
      safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("10"), "0x")
    )
      .to.emit(budget, "BudgetSpent")
      .withArgs(agent.address, ethers.ZeroAddress, ethers.parseEther("10"), ethers.parseEther("10"));
  });
});

describe("MerchantPolicy", function () {
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let merchant: SignerWithAddress;
  let notMerchant: SignerWithAddress;
  let safe: AgentSafe;
  let pe: PolicyEngine;
  let mp: MerchantPolicy;

  beforeEach(async function () {
    [owner, agent, merchant, notMerchant] = await ethers.getSigners();

    const AgentSafeFactory = await ethers.getContractFactory("AgentSafe");
    safe = await AgentSafeFactory.deploy(owner.address);

    const PolicyEngineFactory = await ethers.getContractFactory("PolicyEngine");
    pe = await PolicyEngineFactory.deploy(owner.address, await safe.getAddress());

    const BudgetPolicyFactory = await ethers.getContractFactory("BudgetPolicy");
    const budget = await BudgetPolicyFactory.deploy(
      owner.address,
      await pe.getAddress(),
      ethers.parseEther("1000"),
      0,
      ethers.ZeroAddress
    );
    await pe.addPolicy(await budget.getAddress());

    const MerchantPolicyFactory = await ethers.getContractFactory("MerchantPolicy");
    mp = await MerchantPolicyFactory.deploy(owner.address, await pe.getAddress());
    await mp.addMerchants([merchant.address]);
    await pe.addPolicy(await mp.getAddress());

    await safe.setPolicyEngine(await pe.getAddress());
    await safe.setKeyManager(agent.address);
    await owner.sendTransaction({ to: await safe.getAddress(), value: ethers.parseEther("100") });
  });

  it("should allow payment to whitelisted merchant", async function () {
    await expect(
      safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("1"), "0x")
    ).to.not.be.reverted;
  });

  it("should block payment to non-whitelisted address", async function () {
    await expect(
      safe.connect(agent).agentExecute(notMerchant.address, ethers.parseEther("1"), "0x")
    ).to.be.revertedWith("MP: merchant not whitelisted");
  });

  it("should block direct validate() calls", async function () {
    await expect(
      mp.validate(agent.address, ethers.ZeroAddress, merchant.address, 100n, "0x")
    ).to.be.revertedWith("MP: only PolicyEngine");
  });

  it("should allow removal then block", async function () {
    await mp.removeMerchant(merchant.address);
    await expect(
      safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("1"), "0x")
    ).to.be.revertedWith("MP: merchant not whitelisted");
  });

  it("should reject batch > 100 merchants", async function () {
    const addrs = Array.from({ length: 101 }, (_, i) =>
      ethers.getAddress("0x" + (i + 1).toString(16).padStart(40, "0"))
    );
    await expect(mp.addMerchants(addrs)).to.be.revertedWith("MP: batch too large");
  });

  it("should reject address(0) in addMerchants", async function () {
    await expect(mp.addMerchants([ethers.ZeroAddress]))
      .to.be.revertedWith("MP: zero merchant");
  });

  it("should reject batch containing address(0) among valid addresses", async function () {
    await expect(mp.addMerchants([merchant.address, ethers.ZeroAddress]))
      .to.be.revertedWith("MP: zero merchant");
  });
});

describe("ExpirationPolicy", function () {
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let merchant: SignerWithAddress;
  let safe: AgentSafe;
  let pe: PolicyEngine;
  let ep: ExpirationPolicy;

  beforeEach(async function () {
    [owner, agent, merchant] = await ethers.getSigners();

    const AgentSafeFactory = await ethers.getContractFactory("AgentSafe");
    safe = await AgentSafeFactory.deploy(owner.address);

    const PolicyEngineFactory = await ethers.getContractFactory("PolicyEngine");
    pe = await PolicyEngineFactory.deploy(owner.address, await safe.getAddress());

    const BudgetPolicyFactory = await ethers.getContractFactory("BudgetPolicy");
    const budget = await BudgetPolicyFactory.deploy(
      owner.address,
      await pe.getAddress(),
      ethers.parseEther("1000"),
      0,
      ethers.ZeroAddress
    );
    await pe.addPolicy(await budget.getAddress());

    const now = await time.latest();
    const ExpirationPolicyFactory = await ethers.getContractFactory("ExpirationPolicy");
    ep = await ExpirationPolicyFactory.deploy(
      owner.address,
      await pe.getAddress(),
      now + 7 * 86400 // 7 days from now
    );
    await pe.addPolicy(await ep.getAddress());

    await safe.setPolicyEngine(await pe.getAddress());
    await safe.setKeyManager(agent.address);
    await owner.sendTransaction({ to: await safe.getAddress(), value: ethers.parseEther("100") });
  });

  it("should allow payment before expiry", async function () {
    await expect(
      safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("1"), "0x")
    ).to.not.be.reverted;
  });

  it("should block payment after expiry", async function () {
    await time.increase(7 * 86400 + 1);
    await expect(
      safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("1"), "0x")
    ).to.be.revertedWith("EP: vault expired");
  });

  it("should block direct validate() calls", async function () {
    await expect(
      ep.validate(agent.address, ethers.ZeroAddress, merchant.address, 100n, "0x")
    ).to.be.revertedWith("EP: only PolicyEngine");
  });

  it("should allow no expiry (expiration = 0)", async function () {
    const ExpirationPolicyFactory = await ethers.getContractFactory("ExpirationPolicy");
    const AgentSafeFactory = await ethers.getContractFactory("AgentSafe");
    const PolicyEngineFactory = await ethers.getContractFactory("PolicyEngine");

    const safe2 = await AgentSafeFactory.deploy(owner.address);
    const pe2 = await PolicyEngineFactory.deploy(owner.address, await safe2.getAddress());

    const BudgetPolicyFactory = await ethers.getContractFactory("BudgetPolicy");
    const budget2 = await BudgetPolicyFactory.deploy(
      owner.address, await pe2.getAddress(), ethers.parseEther("1000"), 0, ethers.ZeroAddress
    );
    await pe2.addPolicy(await budget2.getAddress());

    const ep2 = await ExpirationPolicyFactory.deploy(owner.address, await pe2.getAddress(), 0);
    await pe2.addPolicy(await ep2.getAddress());

    await safe2.setPolicyEngine(await pe2.getAddress());
    await safe2.setKeyManager(agent.address);
    await owner.sendTransaction({ to: await safe2.getAddress(), value: ethers.parseEther("10") });

    // Far in the future — expiry=0 means no expiry
    await time.increase(365 * 10 * 86400);
    await expect(
      safe2.connect(agent).agentExecute(merchant.address, ethers.parseEther("1"), "0x")
    ).to.not.be.reverted;
  });
});

describe("Cross-policy interactions — Budget + Merchant + Expiration together", function () {
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let merchant: SignerWithAddress;
  let stranger: SignerWithAddress;
  let safe: AgentSafe;
  let pe: PolicyEngine;
  let budget: BudgetPolicy;
  let mp: MerchantPolicy;
  let ep: ExpirationPolicy;

  const BUDGET = ethers.parseEther("100");

  beforeEach(async function () {
    [owner, agent, merchant, stranger] = await ethers.getSigners();

    const AgentSafeFactory = await ethers.getContractFactory("AgentSafe");
    safe = await AgentSafeFactory.deploy(owner.address);

    const PolicyEngineFactory = await ethers.getContractFactory("PolicyEngine");
    pe = await PolicyEngineFactory.deploy(owner.address, await safe.getAddress());

    const BudgetPolicyFactory = await ethers.getContractFactory("BudgetPolicy");
    budget = await BudgetPolicyFactory.deploy(
      owner.address,
      await pe.getAddress(),
      BUDGET,
      0, // DAILY
      ethers.ZeroAddress
    );

    const MerchantPolicyFactory = await ethers.getContractFactory("MerchantPolicy");
    mp = await MerchantPolicyFactory.deploy(owner.address, await pe.getAddress());
    await mp.addMerchants([merchant.address]);

    const expiry = await time.latest() + 7 * 86400;
    const ExpirationPolicyFactory = await ethers.getContractFactory("ExpirationPolicy");
    ep = await ExpirationPolicyFactory.deploy(owner.address, await pe.getAddress(), expiry);

    // All three policies active
    await pe.addPolicy(await budget.getAddress());
    await pe.addPolicy(await mp.getAddress());
    await pe.addPolicy(await ep.getAddress());

    await safe.setPolicyEngine(await pe.getAddress());
    await safe.setKeyManager(agent.address);
    await owner.sendTransaction({ to: await safe.getAddress(), value: ethers.parseEther("200") });
  });

  it("should allow payment when all three policies pass", async function () {
    await expect(
      safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("10"), "0x")
    ).to.not.be.reverted;
    expect(await budget.spent()).to.equal(ethers.parseEther("10"));
  });

  it("should block when budget exceeded even if merchant and expiry pass", async function () {
    await expect(
      safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("101"), "0x")
    ).to.be.revertedWith("BP: budget exceeded");
  });

  it("should block when merchant not whitelisted even if budget and expiry pass", async function () {
    await expect(
      safe.connect(agent).agentExecute(stranger.address, ethers.parseEther("1"), "0x")
    ).to.be.revertedWith("MP: merchant not whitelisted");
  });

  it("should block when vault expired even if budget and merchant pass", async function () {
    await time.increase(7 * 86400 + 1);
    await expect(
      safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("1"), "0x")
    ).to.be.revertedWith("EP: vault expired");
  });

  it("cumulative spend across multiple payments stays blocked at limit", async function () {
    await safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("60"), "0x");
    await safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("39"), "0x");
    expect(await budget.spent()).to.equal(ethers.parseEther("99"));

    // Next payment of 2 would exceed limit
    await expect(
      safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("2"), "0x")
    ).to.be.revertedWith("BP: budget exceeded");
  });

  it("merchant removal blocks previously-valid payment even within budget and expiry", async function () {
    // Payment works before removal
    await expect(
      safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("1"), "0x")
    ).to.not.be.reverted;

    await mp.removeMerchant(merchant.address);

    // Same payment now blocked by merchant policy
    await expect(
      safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("1"), "0x")
    ).to.be.revertedWith("MP: merchant not whitelisted");
  });
});

describe("PolicyEngine — simulateExecution (DRY-RUN)", function () {
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let merchant: SignerWithAddress;
  let safe: AgentSafe;
  let pe: PolicyEngine;
  let budget: BudgetPolicy;
  let mp: MerchantPolicy;

  const BUDGET = ethers.parseEther("100");

  beforeEach(async function () {
    [owner, agent, merchant] = await ethers.getSigners();

    const AgentSafeFactory = await ethers.getContractFactory("AgentSafe");
    safe = await AgentSafeFactory.deploy(owner.address);

    const PolicyEngineFactory = await ethers.getContractFactory("PolicyEngine");
    pe = await PolicyEngineFactory.deploy(owner.address, await safe.getAddress());

    const BudgetPolicyFactory = await ethers.getContractFactory("BudgetPolicy");
    budget = await BudgetPolicyFactory.deploy(
      owner.address,
      await pe.getAddress(),
      BUDGET,
      0, // DAILY
      ethers.ZeroAddress
    );
    await pe.addPolicy(await budget.getAddress());

    const MerchantPolicyFactory = await ethers.getContractFactory("MerchantPolicy");
    mp = await MerchantPolicyFactory.deploy(owner.address, await pe.getAddress());
    await mp.addMerchants([merchant.address]);
    await pe.addPolicy(await mp.getAddress());

    await safe.setPolicyEngine(await pe.getAddress());
    await safe.setKeyManager(agent.address);
    await owner.sendTransaction({ to: await safe.getAddress(), value: ethers.parseEther("200") });
  });

  it("should return zero address when all policies pass", async function () {
    const result = await pe.simulateExecution.staticCall(
      agent.address,
      ethers.ZeroAddress,
      merchant.address,
      ethers.parseEther("50"),
      "0x"
    );
    expect(result.blockingPolicy).to.equal(ethers.ZeroAddress);
  });

  it("should detect BudgetPolicy blocking when exceeded", async function () {
    // Spend 99 ETH to nearly exhaust budget
    await safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("99"), "0x");

    // Simulate a payment that would exceed budget
    const result = await pe.simulateExecution.staticCall(
      agent.address,
      ethers.ZeroAddress,
      merchant.address,
      ethers.parseEther("2"), // 99 + 2 = 101 > 100
      "0x"
    );

    expect(result.blockingPolicy).to.equal(await budget.getAddress());
  });

  it("should detect MerchantPolicy blocking for non-whitelisted merchant", async function () {
    const [, , , nonMerchant] = await ethers.getSigners();

    const result = await pe.simulateExecution.staticCall(
      agent.address,
      ethers.ZeroAddress,
      nonMerchant.address, // Not whitelisted
      ethers.parseEther("10"),
      "0x"
    );

    expect(result.blockingPolicy).to.equal(await mp.getAddress());
  });

  it("should work correctly as a dry-run without state changes", async function () {
    // Simulate will check all policies
    const result1 = await pe.simulateExecution.staticCall(
      agent.address,
      ethers.ZeroAddress,
      merchant.address,
      ethers.parseEther("50"),
      "0x"
    );
    expect(result1.blockingPolicy).to.equal(ethers.ZeroAddress); // Should pass

    // Spent counter should NOT have increased
    const spentBefore = await budget.spent();
    expect(spentBefore).to.equal(0n);

    // Actually execute (state changes)
    await safe.connect(agent).agentExecute(merchant.address, ethers.parseEther("50"), "0x");

    // Now check spent
    const spentAfter = await budget.spent();
    expect(spentAfter).to.equal(ethers.parseEther("50"));

    // Simulate a 60 ETH payment (would exceed)
    const result2 = await pe.simulateExecution.staticCall(
      agent.address,
      ethers.ZeroAddress,
      merchant.address,
      ethers.parseEther("60"),
      "0x"
    );
    expect(result2.blockingPolicy).to.equal(await budget.getAddress());

    // Spent should still be 50 (no state change from simulate)
    expect(await budget.spent()).to.equal(ethers.parseEther("50"));
  });
});
