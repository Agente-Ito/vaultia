'use client';

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { ethers, BrowserProvider, JsonRpcSigner } from 'ethers';
import { getRegistryContract, RegistryContract } from '@/lib/web3/contracts';

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? '';

type EthereumProvider = ethers.Eip1193Provider & {
  on(event: 'accountsChanged', listener: (accounts: string[]) => void): void;
  on(event: 'chainChanged', listener: () => void): void;
  removeListener(event: 'accountsChanged', listener: (accounts: string[]) => void): void;
  removeListener(event: 'chainChanged', listener: () => void): void;
};

type BrowserWindow = Window & {
  ethereum?: EthereumProvider;
};

function getEthereumProvider() {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as BrowserWindow).ethereum ?? null;
}

interface Web3ContextType {
  account: string | null;
  chainId: number | null;
  signer: JsonRpcSigner | null;
  registry: RegistryContract | null;
  isConnected: boolean;
  isRegistryConfigured: boolean;
  isWrongChain: boolean;
  connect: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const SUPPORTED_CHAIN_IDS = [4201, 42]; // LUKSO Testnet and Mainnet

  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [registry, setRegistry] = useState<RegistryContract | null>(null);

  const buildRegistry = useCallback((providerOrSigner: ethers.Provider | JsonRpcSigner) => {
    if (!REGISTRY_ADDRESS) return null;
    return getRegistryContract(REGISTRY_ADDRESS, providerOrSigner);
  }, []);

  useEffect(() => {
    const ethereum = getEthereumProvider();
    if (!ethereum) return;

    const init = async () => {
      try {
        const provider = new BrowserProvider(ethereum);
        const network = await provider.getNetwork();
        setChainId(Number(network.chainId));

        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          const s = await provider.getSigner();
          setAccount(await s.getAddress());
          setSigner(s);
          setRegistry(buildRegistry(s));
        } else {
          setRegistry(buildRegistry(provider));
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[Web3] init error:', e);
        }
      }
    };

    init();

    const onAccountsChanged = async (accounts: string[]) => {
      const provider = new BrowserProvider(ethereum);
      if (accounts.length === 0) {
        setAccount(null);
        setSigner(null);
        setRegistry(buildRegistry(provider));
      } else {
        const s = await provider.getSigner();
        setAccount(accounts[0]);
        setSigner(s);
        setRegistry(buildRegistry(s));
      }
    };

    const onChainChanged = async () => {
      // Re-init web3 state on chain switch without reloading the page.
      // This preserves form state, scroll position, and React component tree.
      try {
        const provider = new BrowserProvider(ethereum);
        const network = await provider.getNetwork();
        setChainId(Number(network.chainId));
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          const s = await provider.getSigner();
          setAccount(await s.getAddress());
          setSigner(s);
          setRegistry(buildRegistry(s));
        } else {
          setAccount(null);
          setSigner(null);
          setRegistry(buildRegistry(provider));
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[Web3] chain change error:', e);
        }
      }
    };

    ethereum.on('accountsChanged', onAccountsChanged);
    ethereum.on('chainChanged', onChainChanged);
    return () => {
      ethereum.removeListener('accountsChanged', onAccountsChanged);
      ethereum.removeListener('chainChanged', onChainChanged);
    };
  }, [buildRegistry]);

  const connect = async () => {
    const ethereum = getEthereumProvider();
    if (!ethereum) throw new Error('No wallet detected');
    const provider = new BrowserProvider(ethereum);
    await provider.send('eth_requestAccounts', []);
    const s = await provider.getSigner();
    const network = await provider.getNetwork();
    setAccount(await s.getAddress());
    setChainId(Number(network.chainId));
    setSigner(s);
    setRegistry(buildRegistry(s));
  };

  return (
    <Web3Context.Provider value={{
      account, chainId, signer, registry,
      isConnected: !!account,
      isRegistryConfigured: !!REGISTRY_ADDRESS,
      isWrongChain: !!account && !!chainId && !SUPPORTED_CHAIN_IDS.includes(chainId),
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
