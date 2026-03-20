/**
 * Basename / Base ENS resolution utility.
 * Resolves an address to a .base.eth name on Base mainnet (8453) or
 * Base Sepolia (84532). Returns null if no name is found or on any error.
 */

import { ethers } from 'ethers';

/** Base mainnet RPC — no key required for reverse-resolution reads */
const BASE_RPC = 'https://mainnet.base.org';
const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';

/** Chain IDs that support basename resolution */
export const BASENAME_CHAINS = new Set([8453, 84532]);

/**
 * Look up a basename for the given address on Base.
 * @param address  EVM address (checksummed or not)
 * @param chainId  Chain the user is currently connected to
 * @returns  A ".base.eth" name string, or null
 */
export async function lookupBasename(address: string | undefined, chainId: number | undefined): Promise<string | null> {
  if (!address || !chainId || !BASENAME_CHAINS.has(chainId)) return null;
  try {
    const rpc = chainId === 84532 ? BASE_SEPOLIA_RPC : BASE_RPC;
    const provider = new ethers.JsonRpcProvider(rpc);
    const name = await provider.lookupAddress(address);
    return name ?? null;
  } catch {
    return null;
  }
}
