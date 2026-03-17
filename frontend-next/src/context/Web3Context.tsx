'use client';

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { ethers, BrowserProvider, JsonRpcSigner } from 'ethers';
import { getRegistryContract, RegistryContract } from '@/lib/web3/contracts';

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? '';

// ─── Provider detection ───────────────────────────────────────────────────────

type EthereumProvider = ethers.Eip1193Provider & {
  on(event: 'accountsChanged', listener: (accounts: string[]) => void): void;
  on(event: 'chainChanged', listener: () => void): void;
  removeListener(event: 'accountsChanged', listener: (accounts: string[]) => void): void;
  removeListener(event: 'chainChanged', listener: () => void): void;
};

type BrowserWindow = Window & {
  ethereum?: EthereumProvider;
  lukso?: EthereumProvider;   // LUKSO Universal Profile Browser Extension
};

/**
 * Prefer window.lukso (UP Extension) over window.ethereum (MetaMask).
 * Returns the provider and whether it is a Universal Profile provider.
 */
function getInjectedProvider(): { provider: EthereumProvider; isUP: boolean } | null {
  if (typeof window === 'undefined') return null;
  const w = window as BrowserWindow;
  if (w.lukso)    return { provider: w.lukso,    isUP: true  };
  if (w.ethereum) return { provider: w.ethereum, isUP: false };
  return null;
}

// ─── Context type ─────────────────────────────────────────────────────────────

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
  const SUPPORTED_CHAIN_IDS = [4201, 42];

  const [account, setAccount]                     = useState<string | null>(null);
  const [chainId, setChainId]                     = useState<number | null>(null);
  const [signer, setSigner]                       = useState<JsonRpcSigner | null>(null);
  const [registry, setRegistry]                   = useState<RegistryContract | null>(null);
  const [isUniversalProfile, setIsUniversalProfile] = useState(false);
  const [hasUPExtension, setHasUPExtension]       = useState(false);

  const buildRegistry = useCallback((providerOrSigner: ethers.Provider | JsonRpcSigner) => {
    if (!REGISTRY_ADDRESS) return null;
    return getRegistryContract(REGISTRY_ADDRESS, providerOrSigner);
  }, []);

  // Detect UP extension availability (client-side only)
  useEffect(() => {
    setHasUPExtension(!!((window as BrowserWindow).lukso));
  }, []);

  // Restore isUniversalProfile from session storage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('up-is-universal-profile');
      if (stored === 'true') setIsUniversalProfile(true);
    } catch { /* ignore */ }
  }, []);

  // Subscribe to provider events and auto-connect if already approved
  useEffect(() => {
    const detected = getInjectedProvider();
    if (!detected) return;
    const { provider, isUP } = detected;

    const init = async () => {
      try {
        const ethersProvider = new BrowserProvider(provider);
        const network = await ethersProvider.getNetwork();
        setChainId(Number(network.chainId));

        const accounts = await ethersProvider.listAccounts();
        if (accounts.length > 0) {
          const s = await ethersProvider.getSigner();
          const addr = await s.getAddress();
          setAccount(addr);
          setSigner(s);
          setRegistry(buildRegistry(s));
          setIsUniversalProfile(isUP);
          sessionStorage.setItem('up-is-universal-profile', String(isUP));
        } else {
          setRegistry(buildRegistry(ethersProvider));
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'development') console.error('[Web3] init error:', e);
      }
    };

    init();

    const onAccountsChanged = async (accounts: string[]) => {
      const ethersProvider = new BrowserProvider(provider);
      if (accounts.length === 0) {
        setAccount(null);
        setSigner(null);
        setIsUniversalProfile(false);
        sessionStorage.removeItem('up-is-universal-profile');
        setRegistry(buildRegistry(ethersProvider));
      } else {
        const s = await ethersProvider.getSigner();
        setAccount(accounts[0]);
        setSigner(s);
        setRegistry(buildRegistry(s));
        setIsUniversalProfile(isUP);
        sessionStorage.setItem('up-is-universal-profile', String(isUP));
      }
    };

    const onChainChanged = async () => {
      try {
        const ethersProvider = new BrowserProvider(provider);
        const network = await ethersProvider.getNetwork();
        setChainId(Number(network.chainId));
        const accounts = await ethersProvider.listAccounts();
        if (accounts.length > 0) {
          const s = await ethersProvider.getSigner();
          setAccount(await s.getAddress());
          setSigner(s);
          setRegistry(buildRegistry(s));
        } else {
          setAccount(null);
          setSigner(null);
          setRegistry(buildRegistry(ethersProvider));
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'development') console.error('[Web3] chain change error:', e);
      }
    };

    provider.on('accountsChanged', onAccountsChanged);
    provider.on('chainChanged', onChainChanged);
    return () => {
      provider.removeListener('accountsChanged', onAccountsChanged);
      provider.removeListener('chainChanged', onChainChanged);
    };
  }, [buildRegistry]);

  const connect = async () => {
    const detected = getInjectedProvider();
    if (!detected) throw new Error('No wallet detected');
    const { provider, isUP } = detected;
    const ethersProvider = new BrowserProvider(provider);
    await ethersProvider.send('eth_requestAccounts', []);
    const s = await ethersProvider.getSigner();
    const network = await ethersProvider.getNetwork();
    setAccount(await s.getAddress());
    setChainId(Number(network.chainId));
    setSigner(s);
    setRegistry(buildRegistry(s));
    setIsUniversalProfile(isUP);
    sessionStorage.setItem('up-is-universal-profile', String(isUP));
  };

  return (
    <Web3Context.Provider value={{
      account, chainId, signer, registry,
      isConnected: !!account,
      isRegistryConfigured: !!REGISTRY_ADDRESS,
      isWrongChain: !!account && !!chainId && !SUPPORTED_CHAIN_IDS.includes(chainId),
      isUniversalProfile,
      hasUPExtension,
      connect,
    }}>
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3(): Web3ContextType {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error('useWeb3 must be used within Web3Provider');
  return ctx;
}
