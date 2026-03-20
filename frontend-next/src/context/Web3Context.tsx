'use client';

import React, { createContext, useContext, useMemo, useEffect, useState } from 'react';
import { useAccount, useChainId, useWalletClient, useConnect } from 'wagmi';
import { JsonRpcSigner } from 'ethers';
import { getRegistryContract, RegistryContract } from '@/lib/web3/contracts';
import { walletClientToSigner } from '@/lib/web3/signerBridge';

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? '';
const SUPPORTED_CHAIN_IDS = [4201, 42, 8453, 84532];

// ─── Context type (interface unchanged — downstream components unaffected) ────

interface Web3ContextType {
  account: string | null;
  chainId: number | null;
  signer: JsonRpcSigner | null;
  registry: RegistryContract | null;
  isConnected: boolean;
  isRegistryConfigured: boolean;
  isWrongChain: boolean;
  /** True when connected via the LUKSO UP Browser Extension */
  isUniversalProfile: boolean;
  /** True when window.lukso is available (extension installed) */
  hasUPExtension: boolean;
  connect: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const { connectAsync, connectors } = useConnect();

  const [hasUPExtension, setHasUPExtension] = useState(false);

  useEffect(() => {
    setHasUPExtension(typeof window !== 'undefined' && !!window.lukso);
  }, []);

  // RainbowKit's built-in UP connector id
  const isUniversalProfile = connector?.id === 'xyz.universal.profile';

  const signer = useMemo<JsonRpcSigner | null>(() => {
    if (!walletClient) return null;
    try {
      return walletClientToSigner(walletClient);
    } catch {
      return null;
    }
  }, [walletClient]);

  const registry = useMemo<RegistryContract | null>(() => {
    if (!REGISTRY_ADDRESS || !signer) return null;
    return getRegistryContract(REGISTRY_ADDRESS, signer);
  }, [signer]);

  const connect = async () => {
    const upConnector = connectors.find((c) => c.id === 'xyz.universal.profile');
    if (upConnector && hasUPExtension) {
      await connectAsync({ connector: upConnector });
    }
    // For non-UP wallets the RainbowKit modal handles connection
  };

  return (
    <Web3Context.Provider
      value={{
        account: address ?? null,
        chainId: chainId ?? null,
        signer,
        registry,
        isConnected,
        isRegistryConfigured: !!REGISTRY_ADDRESS,
        isWrongChain: isConnected && !!chainId && !SUPPORTED_CHAIN_IDS.includes(chainId),
        isUniversalProfile,
        hasUPExtension,
        connect,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3(): Web3ContextType {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error('useWeb3 must be used within Web3Provider');
  return ctx;
}
