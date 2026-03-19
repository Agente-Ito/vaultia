/**
 * Centralized LSP2 / LSP6 key-derivation helpers for TypeScript.
 *
 * Mirrors exactly the constants used in:
 *   - LSP6Constants.sol  (_LSP6KEY_ADDRESSPERMISSIONS_*)
 *   - LSP6Utils.sol      (generateNewPermissionsKeys)
 *   - AgentVaultRegistry.sol (LSP6_PERMISSIONS_PREFIX, AP_ARRAY_KEY*)
 *
 * Single source of truth for scripts and tests — never duplicate these
 * derivations inline; import from here instead.
 *
 * Spec: https://github.com/lukso-network/LIPs/blob/main/LSPs/LSP-6-KeyManager.md
 */

// ─── Canonical key constants (matches LSP6Constants.sol exactly) ──────────────

/**
 * Full keccak256("AddressPermissions[]").
 * This is where the array LENGTH is stored (as abi.encodePacked(uint128)).
 *
 *   ⚠️  Do NOT use the zero-padded prefix "0xdf30...986 + 0x0000...0000" here —
 *       that key is AddressPermissions[0] (the FIRST ELEMENT), not the length.
 */
export const AP_ARRAY_KEY =
  "0xdf30dba06db6a30e65354d9a64c609861f089545ca58c6b4dbe31a5f338cb0e3";

/** First 16 bytes of AP_ARRAY_KEY, used to derive per-element keys (without 0x). */
const AP_ARRAY_PREFIX = "df30dba06db6a30e65354d9a64c60986";

/** bytes10 MappingWithGrouping prefix for AddressPermissions:Permissions:<addr> (without 0x). */
const AP_PERMISSIONS_PREFIX = "4b80742de2bf82acb363";

// ─── Known LSP6 permission bitmaps ────────────────────────────────────────────

/** All permissions set (used for vault owner / super-controller). */
export const SUPER_PERM =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

/** SUPER_CALL (0x400) | SUPER_TRANSFERVALUE (0x100) — used for agent controllers. */
export const AGENT_PERM =
  "0x0000000000000000000000000000000000000000000000000000000000000500";

// ─── Key derivation ───────────────────────────────────────────────────────────

/**
 * Returns the bytes32 element key for AddressPermissions[index].
 *
 * Format: AP_ARRAY_PREFIX (16 bytes) + uint128(index) as 16 big-endian bytes
 *
 * @example
 *   apArrayElementKey(0)
 *   → "0xdf30dba06db6a30e65354d9a64c6098600000000000000000000000000000000"
 *   apArrayElementKey(1)
 *   → "0xdf30dba06db6a30e65354d9a64c6098600000000000000000000000000000001"
 */
export function apArrayElementKey(index: number | bigint): string {
  const idx = BigInt(index).toString(16).padStart(32, "0"); // uint128 → 16 bytes → 32 hex chars
  return "0x" + AP_ARRAY_PREFIX + idx;
}

/**
 * Returns the bytes32 permissions key for AddressPermissions:Permissions:<controller>.
 *
 * Format: AP_PERMISSIONS_PREFIX (10 bytes) + 0x0000 (2 bytes) + controller (20 bytes)
 * Matches LSP2Utils.generateMappingWithGroupingKey(bytes10, bytes20).
 *
 * @example
 *   apPermissionsKey("0xAbCd...1234")
 *   → "0x4b80742de2bf82acb3630000abcd...1234"
 */
export function apPermissionsKey(controller: string): string {
  const addr = controller.toLowerCase().replace(/^0x/, "");
  if (addr.length !== 40) throw new Error(`apPermissionsKey: invalid address "${controller}"`);
  return "0x" + AP_PERMISSIONS_PREFIX + "0000" + addr;
}

// ─── Storage decoding ─────────────────────────────────────────────────────────

/**
 * Decodes the bytes returned by getData(AP_ARRAY_KEY) into a JS number.
 *
 * The LSP6 standard stores the array length as abi.encodePacked(uint128),
 * i.e. 16 big-endian bytes (confirmed in LSP6Utils.sol line 248):
 *   `values[0] = abi.encodePacked(newArrayLength)` where newArrayLength is uint128.
 *
 * @param rawBytes  Hex string returned directly by ERC725Y.getData()
 *                  (already decoded by ethers — NOT the full ABI-wrapped response).
 */
export function decodeArrayLength(rawBytes: string): number {
  if (!rawBytes || rawBytes === "0x") return 0;
  const hex = rawBytes.startsWith("0x") ? rawBytes.slice(2) : rawBytes;
  if (hex.length === 0) return 0;
  return Number(BigInt("0x" + hex));
}

/**
 * Decodes the bytes returned by getData(apPermissionsKey(addr)) into a bigint bitmap.
 * Stored as abi.encodePacked(bytes32) = 32 bytes.
 */
export function decodePermissions(rawBytes: string): bigint {
  if (!rawBytes || rawBytes === "0x") return 0n;
  const hex = rawBytes.startsWith("0x") ? rawBytes.slice(2) : rawBytes;
  if (hex.length === 0) return 0n;
  return BigInt("0x" + hex.padStart(64, "0"));
}

/**
 * Normalises the controller address stored at an array element key.
 * Stored as abi.encodePacked(bytes20(address)) = 20 bytes.
 *
 * @param rawBytes  e.g. "0xAbCd...1234" (20-byte hex, 40 chars after 0x)
 */
export function decodeControllerAddress(rawBytes: string): string {
  if (!rawBytes || rawBytes === "0x") return "0x" + "0".repeat(40);
  const hex = (rawBytes.startsWith("0x") ? rawBytes.slice(2) : rawBytes).toLowerCase();
  return "0x" + hex.padStart(40, "0");
}
