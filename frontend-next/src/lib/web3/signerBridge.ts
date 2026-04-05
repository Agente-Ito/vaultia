import { type WalletClient } from "viem";
import { BrowserProvider, JsonRpcSigner } from "ethers";

type BrowserWindow = Window & {
  lukso?: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
    isUniversalProfileExtension?: boolean;
  };
};

/**
 * Converts a wagmi WalletClient (viem-backed) to an ethers v6 JsonRpcSigner.
 * Standard bridge pattern for wagmi v2 + ethers v6 interop.
 */
export function walletClientToSigner(walletClient: WalletClient): JsonRpcSigner {
  const { account, chain, transport } = walletClient;
  if (!chain) throw new Error("walletClientToSigner: no chain on WalletClient");
  if (!account) throw new Error("walletClientToSigner: no account on WalletClient");

  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: (chain.contracts as { ensRegistry?: { address: string } } | undefined)
      ?.ensRegistry?.address,
  };

  const injectedLukso = typeof window !== 'undefined' ? (window as BrowserWindow).lukso : undefined;

  // Prefer the UP extension provider directly when available. Its request pipeline
  // is more reliable for complex transaction payloads than the generic walletClient transport.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new BrowserProvider((injectedLukso ?? transport) as any, network);

  return new JsonRpcSigner(provider, account.address);
}
