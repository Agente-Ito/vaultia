/**
 * MultisigE2E.test.ts
 *
 * End-to-end integration tests for MultisigController wired against a real
 * AgentSafe + LSP6KeyManager + PolicyEngine stack.
 *
 * What these tests validate:
 *   - Full call path: KM.execute → vault.execute → _execute (actual LYX transfer)
 *   - Variant A — ANY_SIGNER: any registered signer can trigger execute()
 *   - Variant B — ONLY_OWNER: only the vault owner can trigger execute();
 *                              a non-owner signer reverts with NotExecutor
 *   - timelockEnd is emitted with the correct value in the Proposed event
 *
 * AllowedCalls note:
 *   LSP6 validates AllowedCalls against the FINAL target of ERC725X.execute()
 *   (i.e. the payment recipient), NOT the vault address. These tests wire
 *   encodeAllowedCalls([recipient.address]) for the MultisigController.
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { ContractTransactionReceipt } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  AP_ARRAY_KEY,
  apArrayElementKey,
  apPermissionsKey,
  apAllowedCallsKey,
  PERM_STRICT_PAYMENTS,
  encodeAllowedCalls,
  decodeArrayLength,
} from "../scripts/lsp6Keys";
import { MultisigController, AgentSafe, PolicyEngine } from "../typechain-types";

// ─── Minimal ABI stubs ─────────────────────────────────────────────────────────

const ERC725Y_ABI = [
  "function getData(bytes32 key) external view returns (bytes memory)",
  "function setDataBatch(bytes32[] calldata keys, bytes[] calldata values) external",
];

// ─── Shared stack deployer ─────────────────────────────────────────────────────

interface E2EStack {
  safe:      AgentSafe;
  ms:        MultisigController;
  safeAddr:  string;
  kmAddr:    string;
  msAddr:    string;
  deployer:  SignerWithAddress;
}

/**
 * Deploys a complete real-contract stack and wires LSP6 permissions.
 *
 * @param signerAddrs   Multisig signer list
 * @param threshold     Approval threshold
 * @param timeLock      Global timelock in seconds (0 = none)
 * @param paymentTarget AllowedCalls target for the MultisigController.
 *                      For LYX payments, pass recipient.address.
 *                      For LSP7 token calls, pass the token contract address.
 */
async function deployE2EStack(
  signerAddrs: string[],
  threshold: number,
  timeLock: number,
  paymentTarget: string,
): Promise<E2EStack> {
  const [deployer] = await ethers.getSigners();

  // ── Core contracts ────────────────────────────────────────────────────────
  const SafeF = await ethers.getContractFactory("AgentSafe");
  const KMF   = await ethers.getContractFactory("LSP6KeyManager");
  const PEF   = await ethers.getContractFactory("PolicyEngine");
  const MSF   = await ethers.getContractFactory("MultisigController");

  const safe     = await SafeF.deploy(deployer.address) as AgentSafe;
  const safeAddr = await safe.getAddress();

  const km     = await KMF.deploy(safeAddr);
  const kmAddr = await km.getAddress();
  await safe.connect(deployer).setKeyManager(kmAddr);

  // PolicyEngine with zero policies registered = allow-all (validate() is a no-op loop)
  const pe = await PEF.deploy(deployer.address, safeAddr) as PolicyEngine;
  await safe.connect(deployer).setPolicyEngine(await pe.getAddress());

  // ── MultisigController ────────────────────────────────────────────────────
  const ms     = await MSF.deploy(safeAddr, kmAddr, signerAddrs, threshold, timeLock) as MultisigController;
  const msAddr = await ms.getAddress();

  // ── Wire LSP6 permissions ─────────────────────────────────────────────────
  // Deployer is still the LSP9Vault owner (no LSP14 transfer) → can call
  // setDataBatch directly on the ERC725Y store.
  const safeERC725 = new ethers.Contract(safeAddr, ERC725Y_ABI, deployer);

  const rawLen     = await safeERC725.getData(AP_ARRAY_KEY) as string;
  const currentLen = decodeArrayLength(rawLen);
  const newLen     = "0x" + (currentLen + 1).toString(16).padStart(32, "0");

  await safeERC725.setDataBatch(
    [
      apPermissionsKey(msAddr),    // MS gets CALL | TRANSFERVALUE
      apAllowedCallsKey(msAddr),   // AllowedCalls → payment target (recipient or token)
      apArrayElementKey(currentLen),
      AP_ARRAY_KEY,
    ],
    [
      PERM_STRICT_PAYMENTS,
      encodeAllowedCalls([paymentTarget]),
      ethers.zeroPadValue(msAddr, 32),
      newLen,
    ],
  );

  // ── Fund vault with 2 LYX ────────────────────────────────────────────────
  await deployer.sendTransaction({ to: safeAddr, value: ethers.parseEther("2") });

  return { safe, ms, safeAddr, kmAddr, msAddr, deployer };
}

/** Extracts the proposal id from a transaction receipt by parsing Proposed event. */
function extractProposalId(ms: MultisigController, receipt: ContractTransactionReceipt): string {
  for (const log of receipt.logs) {
    try {
      const parsed = ms.interface.parseLog(log as unknown as { topics: string[]; data: string });
      if (parsed?.name === "Proposed") return parsed.args.id as string;
    } catch { /* skip non-matching logs */ }
  }
  throw new Error("Proposed event not found in receipt");
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("MultisigController — E2E (full call path)", function () {
  let alice:     SignerWithAddress; // signer index 1
  let bob:       SignerWithAddress; // signer index 2
  let carol:     SignerWithAddress; // index 3 — non-signer, non-owner
  let recipient: SignerWithAddress; // index 4 — payment destination

  before(async function () {
    // signers[0] is the deployer (vault owner), returned via deployE2EStack
    [, alice, bob, carol, recipient] = await ethers.getSigners();
  });

  // ─── Variant A: ANY_SIGNER ─────────────────────────────────────────────────

  describe("Variant A — ANY_SIGNER", function () {
    it("propose → approve → execute transfers LYX; proposal status = EXECUTED", async function () {
      const { ms } = await deployE2EStack(
        [alice.address, bob.address],
        2,
        0,
        recipient.address, // AllowedCalls → final LYX destination
      );

      const amount = ethers.parseEther("1");

      // Alice proposes (auto-approved as proposer)
      const proposeTx = await ms.connect(alice).propose(
        recipient.address,
        amount,
        "0x",
        0,  // deadline = no expiry
        0,  // timelockOverride = use global (0)
        1,  // ExecutorMode.ANY_SIGNER
      );
      const id = extractProposalId(ms, (await proposeTx.wait())!);

      // Bob approves → quorum 2/2
      await ms.connect(bob).approve(id);
      expect(await ms.hasQuorum(id)).to.be.true;

      const balanceBefore = await ethers.provider.getBalance(recipient.address);

      // Alice executes (she is a signer → ANY_SIGNER satisfied)
      await expect(ms.connect(alice).execute(id)).to.not.be.reverted;

      const balanceAfter = await ethers.provider.getBalance(recipient.address);

      expect((await ms.proposals(id)).status).to.equal(1n); // EXECUTED
      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("non-signer cannot execute in ANY_SIGNER mode", async function () {
      const { ms } = await deployE2EStack(
        [alice.address, bob.address],
        2,
        0,
        recipient.address,
      );

      const proposeTx = await ms.connect(alice).propose(recipient.address, 0n, "0x", 0, 0, 1);
      const id        = extractProposalId(ms, (await proposeTx.wait())!);
      await ms.connect(bob).approve(id);

      await expect(ms.connect(carol).execute(id))
        .to.be.revertedWithCustomError(ms, "NotExecutor");
    });
  });

  // ─── Variant B: ONLY_OWNER ─────────────────────────────────────────────────

  describe("Variant B — ONLY_OWNER", function () {
    it("signer (non-owner) reverts with NotExecutor; vault owner succeeds and transfers LYX", async function () {
      const { ms, deployer } = await deployE2EStack(
        [alice.address, bob.address],
        2,
        0,
        recipient.address,
      );

      const amount = ethers.parseEther("1");

      // Alice proposes with ONLY_OWNER mode
      const proposeTx = await ms.connect(alice).propose(
        recipient.address,
        amount,
        "0x",
        0,  // no deadline
        0,  // no timelockOverride
        0,  // ExecutorMode.ONLY_OWNER
      );
      const id = extractProposalId(ms, (await proposeTx.wait())!);

      // Bob approves → quorum reached
      await ms.connect(bob).approve(id);
      expect(await ms.hasQuorum(id)).to.be.true;

      // Bob is a signer but NOT the vault owner → reverts
      await expect(ms.connect(bob).execute(id))
        .to.be.revertedWithCustomError(ms, "NotExecutor");

      // Carol is neither signer nor owner → also reverts
      await expect(ms.connect(carol).execute(id))
        .to.be.revertedWithCustomError(ms, "NotExecutor");

      const balanceBefore = await ethers.provider.getBalance(recipient.address);

      // deployer IS vault.owner() → succeeds
      await expect(ms.connect(deployer).execute(id)).to.not.be.reverted;

      const balanceAfter = await ethers.provider.getBalance(recipient.address);

      expect((await ms.proposals(id)).status).to.equal(1n); // EXECUTED
      expect(balanceAfter - balanceBefore).to.equal(amount);
    });
  });

  // ─── timelockEnd in Proposed event ────────────────────────────────────────

  describe("Proposed event — timelockEnd field", function () {
    it("emits timelockEnd = block.timestamp + effectiveTimelock", async function () {
      const timelockSeconds = 3600;

      const { ms } = await deployE2EStack(
        [alice.address, bob.address],
        1,
        timelockSeconds,
        recipient.address,
      );

      const timestampBefore = await time.latest();

      const tx      = await ms.connect(alice).propose(recipient.address, 0n, "0x", 0, 0, 1);
      const receipt = await tx.wait();

      let timelockEnd: bigint | undefined;
      for (const log of receipt!.logs) {
        try {
          const parsed = ms.interface.parseLog(log as unknown as { topics: string[]; data: string });
          if (parsed?.name === "Proposed") {
            timelockEnd = parsed.args.timelockEnd as bigint;
            break;
          }
        } catch { /* skip */ }
      }

      expect(timelockEnd).to.not.be.undefined;
      // timelockEnd must be at least timestampBefore + timelockSeconds
      expect(timelockEnd!).to.be.gte(BigInt(timestampBefore + timelockSeconds));
      // and at most a few seconds after (no realistic delay)
      expect(timelockEnd!).to.be.lte(BigInt(timestampBefore + timelockSeconds + 10));
    });

    it("timelockEnd = 0 boundary: with zero timelock, execution is immediately available", async function () {
      const { ms } = await deployE2EStack(
        [alice.address, bob.address],
        1,
        0, // no timelock
        recipient.address,
      );

      const tx  = await ms.connect(alice).propose(recipient.address, 0n, "0x", 0, 0, 1);
      const id  = extractProposalId(ms, (await tx.wait())!);
      const p   = await ms.proposals(id);

      // With timeLock = 0 and timelockOverride = 0, timelockEnd = block.timestamp + 0
      // execute() checks block.timestamp < timelockEnd → false, so no lock
      await expect(ms.connect(alice).execute(id)).to.not.be.reverted;
      expect((await ms.proposals(id)).status).to.equal(1n); // EXECUTED
    });
  });
});
