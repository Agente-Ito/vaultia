export type VerifiedRunId = 'native' | 'lsp7';

export interface VerifiedRunTransaction {
  name: string;
  hash: string;
  blockNumber: number | null;
  link: string;
}

export interface VerifiedRunStaticCheck {
  name: string;
  expectedReason: string;
  transactionHash: string | null;
}

export interface VerifiedRun {
  id: VerifiedRunId;
  artifactRelativePath: string;
  network: string;
  chainId: number;
  blockNumber: number;
  explorerBaseUrl: string;
  registryAddress: string;
  safeAddress: string;
  keyManagerAddress: string;
  policyEngineAddress: string;
  tokenAddress: string | null;
  merchant: string;
  limitedRecipient: string;
  outsider: string;
  configuredBudget: string;
  configuredRecipientLimit: string;
  primaryFundingLabel: 'vaultFundingAmount' | 'tokenMintAmount';
  primaryFundingAmount: string;
  lyxSeedAmount: string | null;
  limitedRecipientPaymentAmount: string;
  merchantPaymentAmount: string;
  successfulTransactions: VerifiedRunTransaction[];
  staticChecks: VerifiedRunStaticCheck[];
  links: Record<string, string>;
}