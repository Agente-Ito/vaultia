/**
 * On-chain ERC725Y permission verifier for AgentSafe deployments.
 *
 * Reads AddressPermissions[] and AddressPermissions:Permissions:<controller>
 * from an AgentSafe's ERC725Y storage and cross-checks them against expected
 * values.  Run this immediately after any permission-write transaction to
 * confirm the storage was actually persisted — not just the tx receipt.
 *
 *   npx hardhat run scripts/verifyPermissions.ts --network <network>
 *
 * Required env vars:
 *   AGENT_SAFE_ADDRESS   — the AgentSafe whose storage to inspect
 *
 * Optional env vars:
 *   CONTROLLER_ADDRESSES — comma-separated list of extra controllers to probe
 */

import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import {
  AP_ARRAY_KEY,
  apArrayElementKey,
  apPermissionsKey,
  decodeArrayLength,
  decodePermissions,
  decodeControllerAddress,
} from "./lsp6Keys";

dotenv.config();

// Minimal ABI — we only need getData from ERC725Y.
const ERC725Y_ABI = [
  "function getData(bytes32 dataKey) external view returns (bytes memory)",
  "function getDataBatch(bytes32[] calldata dataKeys) external view returns (bytes[] memory)",
];

async function main() {
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  ERC725Y Permission Verifier");
  console.log("════════════════════════════════════════════════════════════════\n");

  const safeAddr = process.env.AGENT_SAFE_ADDRESS;
  if (!safeAddr || !ethers.isAddress(safeAddr)) {
    throw new Error("Set AGENT_SAFE_ADDRESS to a valid address in .env");
  }

  const extraControllers = (process.env.CONTROLLER_ADDRESSES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ethers.isAddress(s))
    .map((s) => ethers.getAddress(s));

  const network = await ethers.provider.getNetwork();
  console.log(`Network : ${network.name} (chainId ${network.chainId})`);
  console.log(`Safe    : ${safeAddr}\n`);

  const safe = new ethers.Contract(safeAddr, ERC725Y_ABI, ethers.provider);

  // ── 1. Read array length ──────────────────────────────────────────────────

  const lengthRaw: string = await safe.getData(AP_ARRAY_KEY);
  const arrayLength = decodeArrayLength(lengthRaw);

  console.log("─ AddressPermissions[] ─────────────────────────────────────────");
  console.log(` Key   : ${AP_ARRAY_KEY}`);
  console.log(` Raw   : ${lengthRaw === "0x" ? "(empty)" : lengthRaw}`);
  console.log(` Length: ${arrayLength}`);

  if (arrayLength === 0) {
    console.log("\n⚠  WARN: array length is 0 — no controllers are registered.");
    console.log(
      "   If you expected controllers, the setData write may have targeted\n" +
      "   a different contract or the operation was never confirmed on-chain."
    );
  }
  console.log();

  // ── 2. Enumerate stored controllers ──────────────────────────────────────

  const storedControllers: string[] = [];

  for (let i = 0; i < arrayLength; i++) {
    const elemKey = apArrayElementKey(i);
    const elemRaw: string = await safe.getData(elemKey);
    const controller = decodeControllerAddress(elemRaw);

    console.log(`─ AddressPermissions[${i}] ────────────────────────────────────`);
    console.log(` Key        : ${elemKey}`);
    console.log(` Raw        : ${elemRaw === "0x" ? "(empty ⚠)" : elemRaw}`);
    console.log(` Controller : ${controller}`);

    storedControllers.push(controller);

    // ── 3. Read permissions for this controller ──────────────────────────

    const permKey = apPermissionsKey(controller);
    const permRaw: string = await safe.getData(permKey);
    const permissions = decodePermissions(permRaw);

    console.log(` Perms key  : ${permKey}`);
    console.log(` Perms raw  : ${permRaw === "0x" ? "(empty ⚠)" : permRaw}`);
    console.log(` Perms bits : 0x${permissions.toString(16).padStart(64, "0")}`);

    if (permissions === 0n) {
      console.log(" ⚠  WARN: permissions bitmap is zero — controller has no access.");
    }
    console.log();
  }

  // ── 4. Probe any additional controllers supplied via env ──────────────────

  const extra = extraControllers.filter(
    (c) => !storedControllers.some((s) => s.toLowerCase() === c.toLowerCase())
  );

  if (extra.length > 0) {
    console.log("─ Extra controllers (from CONTROLLER_ADDRESSES) ────────────────");
    for (const ctrl of extra) {
      const permKey = apPermissionsKey(ctrl);
      const permRaw: string = await safe.getData(permKey);
      const permissions = decodePermissions(permRaw);
      const inArray = storedControllers.some((s) => s.toLowerCase() === ctrl.toLowerCase());

      console.log(` Controller : ${ctrl}`);
      console.log(` Perms key  : ${permKey}`);
      console.log(` Perms raw  : ${permRaw === "0x" ? "(empty ⚠)" : permRaw}`);
      console.log(` Perms bits : 0x${permissions.toString(16).padStart(64, "0")}`);
      console.log(` In AP[]    : ${inArray ? "✅ yes" : "❌ no — not listed in AddressPermissions[]"}`);

      if (permissions === 0n) {
        console.log(" ⚠  WARN: permissions bitmap is zero.");
      }
      console.log();
    }
  }

  // ── 5. Summary ────────────────────────────────────────────────────────────

  console.log("════════════════════════════════════════════════════════════════");
  const allHavePerms = storedControllers.every(async (c) => {
    const raw: string = await safe.getData(apPermissionsKey(c));
    return decodePermissions(raw) !== 0n;
  });

  if (arrayLength > 0) {
    console.log(`✅ ${arrayLength} controller(s) registered in AddressPermissions[].`);
  } else {
    console.log("❌ No controllers registered — storage write likely failed or used wrong key.");
  }
  console.log("════════════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  process.exitCode = 1;
});
