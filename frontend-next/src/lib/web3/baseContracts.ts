import { Contract, ethers, JsonRpcProvider, Provider, Signer, ContractTransactionResponse } from 'ethers';

// ─── Token registries ─────────────────────────────────────────────────────────

/** Base mainnet well-known token addresses */
export const BASE_MAINNET_TOKENS = {
  USDC:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  WETH:  '0x4200000000000000000000000000000000000006',
  cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
  ETH:   ethers.ZeroAddress,
} as const;

/** Base Sepolia well-known token addresses */
export const BASE_SEPOLIA_TOKENS = {
  USDC:  '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  WETH:  '0x4200000000000000000000000000000000000006',
  ETH:   ethers.ZeroAddress,
} as const;

export interface BaseTokenMeta {
  symbol: string;
  decimals: number;
  emoji: string;
}

/** Metadata keyed by lowercase token address */
export function buildBaseTokenMeta(chainId: number): Record<string, BaseTokenMeta> {
  const isMainnet = chainId === 8453;
  const tokens = isMainnet ? BASE_MAINNET_TOKENS : BASE_SEPOLIA_TOKENS;
  const meta: Record<string, BaseTokenMeta> = {
    [ethers.ZeroAddress]: { symbol: 'ETH', decimals: 18, emoji: '⟠' },
    [tokens.WETH.toLowerCase()]: { symbol: 'WETH', decimals: 18, emoji: '⚡' },
    [tokens.USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6, emoji: '💵' },
  };
  if (isMainnet) {
    meta[BASE_MAINNET_TOKENS.cbBTC.toLowerCase()] = { symbol: 'cbBTC', decimals: 8, emoji: '₿' };
  }
  return meta;
}

/** Selectable tokens for the "Create Base Vault" UI */
export function getBaseTokenOptions(chainId: number) {
  const isMainnet = chainId === 8453;
  const tokens = isMainnet ? BASE_MAINNET_TOKENS : BASE_SEPOLIA_TOKENS;
  const opts = [
    { address: tokens.USDC, symbol: 'USDC', decimals: 6, emoji: '💵' },
    { address: tokens.WETH, symbol: 'WETH', decimals: 18, emoji: '⚡' },
    { address: ethers.ZeroAddress, symbol: 'ETH', decimals: 18, emoji: '⟠' },
  ];
  if (isMainnet) {
    opts.splice(2, 0, { address: BASE_MAINNET_TOKENS.cbBTC, symbol: 'cbBTC', decimals: 8, emoji: '₿' });
  }
  return opts;
}

// ─── Chain config ─────────────────────────────────────────────────────────────

export const BASE_CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? '84532'
);

const BASE_RPC_URL =
  process.env.NEXT_PUBLIC_BASE_RPC_URL ??
  (BASE_CHAIN_ID === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BaseVaultRecord {
  vault: string;
  policyEngine: string;
  label: string;
  token: string; // address(0) = ETH or multi-token
}

export type BaseVaultFactoryContract = Contract & {
  deployVault(p: {
    label: string;
    token: string;
    budget: bigint;
    period: number;
    tokenBudgets: Array<{ token: string; limit: bigint; period: number }>;
    expiration: bigint;
    agents: string[];
    agentBudgets: bigint[];
    merchants: string[];
  }): Promise<ContractTransactionResponse>;
  getVaults(owner: string): Promise<Array<{ vault: string; policyEngine: string; label: string; token: string }>>;
  getPolicyEngine(vault: string): Promise<string>;
};

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const BaseVaultFactoryAbi = [
  `function deployVault(
    tuple(
      string label,
      address token,
      uint256 budget,
      uint8 period,
      tuple(address token,uint256 limit,uint8 period)[] tokenBudgets,
      uint256 expiration,
      address[] agents,
      uint256[] agentBudgets,
      address[] merchants
    ) p
  ) external returns (tuple(address vault,address policyEngine,string label,address token))`,
  'function getVaults(address owner) external view returns (tuple(address vault,address policyEngine,string label,address token)[])',
  'function getPolicyEngine(address vault) external view returns (address)',
  'event VaultDeployed(address indexed owner,address indexed vault,address indexed policyEngine,string label,address token,uint256 chainId)',
];

export const BaseAgentVaultAbi = [
  'function owner() external view returns (address)',
  'function policyEngine() external view returns (address)',
  'function authorizedAgents(address) external view returns (bool)',
  'function tokenBalance(address token) external view returns (uint256)',
  'function addAgent(address agent) external',
  'function removeAgent(address agent) external',
  'function executePayment(address token,address to,uint256 amount) external',
  'function withdraw(address token,uint256 amount) external',
  'function depositToken(address token,uint256 amount) external',
  'event AgentPaymentExecuted(address indexed agent,address indexed token,address indexed to,uint256 amount)',
];

// ─── Factory helpers ──────────────────────────────────────────────────────────

export function getBaseReadProvider(): JsonRpcProvider {
  return new ethers.JsonRpcProvider(BASE_RPC_URL);
}

export function getBaseVaultFactoryContract(
  provider: Provider | Signer
): BaseVaultFactoryContract {
  const address = process.env.NEXT_PUBLIC_BASE_VAULT_FACTORY_ADDRESS ?? '';
  if (!address) throw new Error('NEXT_PUBLIC_BASE_VAULT_FACTORY_ADDRESS not set');
  return new Contract(address, BaseVaultFactoryAbi, provider) as BaseVaultFactoryContract;
}

export function getBaseAgentVaultContract(
  address: string,
  provider: Provider | Signer
) {
  return new Contract(address, BaseAgentVaultAbi, provider);
}

export function isBaseFactoryConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_BASE_VAULT_FACTORY_ADDRESS;
}

// ─── Network switching ────────────────────────────────────────────────────────

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

/** Ask MetaMask to switch to Base. Adds the chain if not present. */
export async function switchToBase(): Promise<void> {
  const eth = (typeof window !== 'undefined' ? (window as Window & { ethereum?: EthereumProvider }).ethereum : undefined);
  if (!eth) throw new Error('No injected provider (MetaMask) found');

  const chainHex = `0x${BASE_CHAIN_ID.toString(16)}`;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
  } catch (err: unknown) {
    const switchErr = err as { code?: number };
    if (switchErr.code === 4902) {
      const isMainnet = BASE_CHAIN_ID === 8453;
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: chainHex,
          chainName: isMainnet ? 'Base' : 'Base Sepolia Testnet',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [isMainnet ? 'https://mainnet.base.org' : 'https://sepolia.base.org'],
          blockExplorerUrls: [isMainnet ? 'https://basescan.org' : 'https://sepolia.basescan.org'],
        }],
      });
    } else {
      throw err;
    }
  }
}

/** Get a Base-network signer from window.ethereum (after switchToBase). */
export async function getBaseSigner() {
  const eth = (typeof window !== 'undefined' ? (window as Window & { ethereum?: EthereumProvider }).ethereum : undefined);
  if (!eth) throw new Error('No injected provider found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new ethers.BrowserProvider(eth as any);
  return provider.getSigner();
}
