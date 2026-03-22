import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import type {
  VerifiedRun,
  VerifiedRunId,
  VerifiedRunStaticCheck,
  VerifiedRunTransaction,
} from './types';

type ArtifactShape = {
  network: string;
  chainId: number;
  blockNumber: number;
  explorerBaseUrl: string;
  registryAddress: string;
  safeAddress: string;
  keyManagerAddress: string;
  policyEngineAddress: string;
  tokenAddress?: string;
  merchant: string;
  limitedRecipient: string;
  outsider: string;
  configuredBudget?: string;
  configuredTokenBudget?: string;
  configuredRecipientLimit: string;
  vaultFundingAmount?: string;
  tokenMintAmount?: string;
  lyxSeedAmount?: string;
  limitedRecipientPaymentAmount: string;
  merchantPaymentAmount: string;
  transactions: Record<string, { hash: string; blockNumber: number | null; link: string }>;
  staticChecks: Record<string, { expectedReason: string; transactionHash: string | null }>;
  links: Record<string, string>;
};

const RUN_SPECS: Array<{ id: VerifiedRunId; filename: string }> = [
  { id: 'native', filename: 'live-stress-4201.json' },
  { id: 'lsp7', filename: 'live-stress-lsp7-4201.json' },
];

function getRepoRoot() {
  return path.resolve(process.cwd(), '..');
}

function toTransactions(transactions: ArtifactShape['transactions']): VerifiedRunTransaction[] {
  return Object.entries(transactions).map(([name, value]) => ({
    name,
    hash: value.hash,
    blockNumber: value.blockNumber,
    link: value.link,
  }));
}

function toStaticChecks(staticChecks: ArtifactShape['staticChecks']): VerifiedRunStaticCheck[] {
  return Object.entries(staticChecks).map(([name, value]) => ({
    name,
    expectedReason: value.expectedReason,
    transactionHash: value.transactionHash,
  }));
}

function loadRun(id: VerifiedRunId, filename: string): VerifiedRun | null {
  const artifactPath = path.join(getRepoRoot(), 'deployments', filename);
  if (!fs.existsSync(artifactPath)) {
    return null;
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as ArtifactShape;

  return {
    id,
    artifactRelativePath: `deployments/${filename}`,
    network: artifact.network,
    chainId: artifact.chainId,
    blockNumber: artifact.blockNumber,
    explorerBaseUrl: artifact.explorerBaseUrl,
    registryAddress: artifact.registryAddress,
    safeAddress: artifact.safeAddress,
    keyManagerAddress: artifact.keyManagerAddress,
    policyEngineAddress: artifact.policyEngineAddress,
    tokenAddress: artifact.tokenAddress ?? null,
    merchant: artifact.merchant,
    limitedRecipient: artifact.limitedRecipient,
    outsider: artifact.outsider,
    configuredBudget: artifact.configuredBudget ?? artifact.configuredTokenBudget ?? '0',
    configuredRecipientLimit: artifact.configuredRecipientLimit,
    primaryFundingLabel: artifact.tokenMintAmount ? 'tokenMintAmount' : 'vaultFundingAmount',
    primaryFundingAmount: artifact.tokenMintAmount ?? artifact.vaultFundingAmount ?? '0',
    lyxSeedAmount: artifact.lyxSeedAmount ?? null,
    limitedRecipientPaymentAmount: artifact.limitedRecipientPaymentAmount,
    merchantPaymentAmount: artifact.merchantPaymentAmount,
    successfulTransactions: toTransactions(artifact.transactions),
    staticChecks: toStaticChecks(artifact.staticChecks),
    links: artifact.links,
  };
}

export function getVerifiedRuns(): VerifiedRun[] {
  return RUN_SPECS
    .map((spec) => loadRun(spec.id, spec.filename))
    .filter((run): run is VerifiedRun => run !== null);
}