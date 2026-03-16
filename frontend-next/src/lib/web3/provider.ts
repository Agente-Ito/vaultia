import { ethers } from 'ethers';

const RPC_URL = (process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545');

let browserProvider: ethers.BrowserProvider | null = null;
let readOnlyProvider: ethers.JsonRpcProvider | null = null;

type BrowserWindow = Window & {
  ethereum?: ethers.Eip1193Provider;
};

function getInjectedProvider(): ethers.Eip1193Provider | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as BrowserWindow).ethereum ?? null;
}

export function getReadOnlyProvider() {
  if (!readOnlyProvider) {
    readOnlyProvider = new ethers.JsonRpcProvider(RPC_URL);
  }

  return readOnlyProvider;
}

export function getBrowserProvider() {
  const externalProvider = getInjectedProvider();
  if (!externalProvider) {
    throw new Error('No wallet detected');
  }

  if (!browserProvider) {
    browserProvider = new ethers.BrowserProvider(externalProvider);
  }

  return browserProvider;
}

export function getProvider() {
  return getInjectedProvider() ? getBrowserProvider() : getReadOnlyProvider();
}

export async function connectWallet() {
  const web3Provider = getBrowserProvider();
  const accounts = await web3Provider.send('eth_requestAccounts', []);
  return accounts[0];
}

export function getSigner() {
  return getBrowserProvider().getSigner();
}
