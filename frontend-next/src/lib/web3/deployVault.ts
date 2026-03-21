import { ethers } from 'ethers';
import type { ContractTransactionReceipt, ContractTransactionResponse } from 'ethers';
import type { RegistryContract } from '@/lib/web3/contracts';
import type { RecipientEntry } from '@/context/OnboardingContext';

export const AgentMode = {
  STRICT_PAYMENTS: 0,
  SUBSCRIPTIONS: 1,
  TREASURY_BALANCED: 2,
  OPS_ADMIN: 3,
  CUSTOM: 4,
} as const;

const PERM_STRICT_PAYMENTS = '0x0000000000000000000000000000000000000000000000000000000000000A00';
const PERM_SUBSCRIPTIONS = '0x0000000000000000000000000000000000000000000000000000000000400A00';
const PERM_TREASURY_BALANCED = '0x0000000000000000000000000000000000000000000000000000000000002A00';
const PERM_OPS_ADMIN = '0x0000000000000000000000000000000000000000000000000000000000040000';
export const PERM_POWER_USER = '0x0000000000000000000000000000000000000000000000000000000000000500';

const ANY_STANDARD_ID = 'ffffffff';
const ANY_FUNCTION_SIG = 'ffffffff';
const ALLOWED_CALL_TYPE_CALL_AND_VALUE = 3;

export type DeployPeriodKey = 'daily' | 'weekly' | 'monthly' | 'hourly' | 'five-minutes';
export type SimpleWizardGoal =
  | 'pay_people'
  | 'pay_vendors'
  | 'subscriptions'
  | 'save_funds'
  | 'payroll'
  | 'grants'
  | 'treasury_rebalance'
  | 'tax_reserve';
export type SimpleSafetyLevel = 'safe' | 'flexible' | 'advanced';
export type SimpleExecutor = 'me' | 'vaultia' | 'my_agent';

export interface RecipientConfig {
  recipient: string;
  budget: bigint;
  period: number;
}

export interface RegistryDeployParams {
  budget: bigint;
  period: number;
  budgetToken: string;
  expiration: bigint;
  agents: string[];
  agentBudgets: bigint[];
  merchants: string[];
  /** Per-recipient limits. When non-empty, deploys RecipientBudgetPolicy instead of (or alongside) MerchantPolicy. */
  recipientConfigs: RecipientConfig[];
  label: string;
  agentMode: number;
  allowSuperPermissions: boolean;
  customAgentPermissions: string;
  allowedCallsByAgent: Array<{ agent: string; allowedCalls: string }>;
}

export interface DeployRegistryVaultOptions {
  registry: RegistryContract;
  params: RegistryDeployParams;
  owner?: string;
  existingSafeAddresses?: Set<string>;
}

export interface SimpleWizardDeployInput {
  vaultName?: string;
  goal: SimpleWizardGoal | null;
  recipients: RecipientEntry[];
  maxPerTx: string;
  frequency: DeployPeriodKey;
  agentEnabled: boolean;
  executor: SimpleExecutor;
  safetyLevel: SimpleSafetyLevel;
  /** Custom LSP7 token address. Empty string = native LYX (ZeroAddress). */
  luksoToken?: string;
  /** Address of the user's own agent (executor === 'my_agent'). Empty = no agent registered. */
  myAgentAddress?: string;
  /** When true, deploy RecipientBudgetPolicy instead of plain MerchantPolicy. */
  recipientLimitsEnabled?: boolean;
  /** 'global' = same limit for all recipients; 'per' = individual limits. */
  recipientLimitMode?: 'global' | 'per';
  /** Used when recipientLimitMode === 'global'. */
  globalRecipientLimit?: { amount: string; period: DeployPeriodKey };
  /** Used when recipientLimitMode === 'per'. Key = normalized address. */
  perRecipientLimits?: Record<string, { amount: string; period: DeployPeriodKey }>;
}

interface ValidateSimpleWizardOptions {
  requireGoal?: boolean;
  requireRecipients?: boolean;
  strictExecutorSetup?: boolean;
}

export const PERIOD_MAP: Record<DeployPeriodKey, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  hourly: 3,
  'five-minutes': 4,
};

export function parseBudgetToWei(value: string, fallback = '0'): bigint {
  return ethers.parseEther(value || fallback);
}

const SIMPLE_GOAL_LABELS: Record<SimpleWizardGoal, string> = {
  pay_people: 'Payments',
  pay_vendors: 'Vendor Payments',
  subscriptions: 'Subscriptions',
  save_funds: 'Savings',
  payroll: 'Payroll',
  grants: 'Grants',
  treasury_rebalance: 'Treasury Rebalance',
  tax_reserve: 'Tax Reserve',
};

const SIMPLE_GOAL_MODE: Record<SimpleWizardGoal, number> = {
  pay_people: AgentMode.STRICT_PAYMENTS,
  pay_vendors: AgentMode.SUBSCRIPTIONS,
  subscriptions: AgentMode.SUBSCRIPTIONS,
  save_funds: AgentMode.TREASURY_BALANCED,
  payroll: AgentMode.STRICT_PAYMENTS,
  grants: AgentMode.STRICT_PAYMENTS,
  treasury_rebalance: AgentMode.TREASURY_BALANCED,
  tax_reserve: AgentMode.TREASURY_BALANCED,
};

function goalNeedsRecipients(goal: SimpleWizardGoal | null): boolean {
  return goal !== 'save_funds' && goal !== 'treasury_rebalance' && goal !== 'tax_reserve';
}

export function validateRecipient(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'empty';
  if (!ethers.isAddress(trimmed)) return 'invalid_address';
  return null;
}

export function normalizeRecipient(value: string): string {
  return ethers.getAddress(value.trim());
}

export function validateSimpleWizardInput(
  input: SimpleWizardDeployInput,
  options: ValidateSimpleWizardOptions = {}
): string[] {
  const errors: string[] = [];

  if (options.requireGoal !== false && !input.goal) {
    errors.push('missing_goal');
  }

  if (!input.maxPerTx || Number.isNaN(Number(input.maxPerTx)) || Number(input.maxPerTx) <= 0) {
    errors.push('invalid_amount');
  }

  const normalizedRecipients = new Set<string>();
  for (const rawRecipient of input.recipients) {
    const recipientError = validateRecipient(rawRecipient.address);
    if (recipientError) {
      errors.push(recipientError);
      continue;
    }

    const normalized = normalizeRecipient(rawRecipient.address);
    if (normalizedRecipients.has(normalized)) {
      errors.push('duplicate_address');
      continue;
    }
    normalizedRecipients.add(normalized);
  }

  if ((options.requireRecipients ?? true) && goalNeedsRecipients(input.goal) && normalizedRecipients.size === 0) {
    errors.push('missing_recipients');
  }

  if (input.agentEnabled && input.executor === 'me') {
    errors.push('manual_executor_invalid');
  }

  return [...new Set(errors)];
}

export function encodeAllowedCallsForTargets(targets: string[]): string {
  if (targets.length === 0) return '0x';
  const entries = targets.map((addr) => {
    const normalized = ethers.getAddress(addr).slice(2).toLowerCase();
    return `0020${ALLOWED_CALL_TYPE_CALL_AND_VALUE.toString(16).padStart(8, '0')}${normalized}${ANY_STANDARD_ID}${ANY_FUNCTION_SIG}`;
  });
  return `0x${entries.join('')}`;
}

export function permissionHexForMode(agentMode: number): string {
  if (agentMode === AgentMode.STRICT_PAYMENTS) return PERM_STRICT_PAYMENTS;
  if (agentMode === AgentMode.SUBSCRIPTIONS) return PERM_SUBSCRIPTIONS;
  if (agentMode === AgentMode.TREASURY_BALANCED) return PERM_TREASURY_BALANCED;
  if (agentMode === AgentMode.OPS_ADMIN) return PERM_OPS_ADMIN;
  return PERM_POWER_USER;
}

export function buildRegistryDeployParams(params: Partial<RegistryDeployParams> & Pick<RegistryDeployParams, 'budget' | 'period' | 'label'>): RegistryDeployParams {
  return {
    budget: params.budget,
    period: params.period,
    budgetToken: params.budgetToken ?? ethers.ZeroAddress,
    expiration: params.expiration ?? BigInt(0),
    agents: params.agents ?? [],
    agentBudgets: params.agentBudgets ?? [],
    merchants: params.merchants ?? [],
    recipientConfigs: params.recipientConfigs ?? [],
    label: params.label,
    agentMode: params.agentMode ?? AgentMode.STRICT_PAYMENTS,
    allowSuperPermissions: params.allowSuperPermissions ?? false,
    customAgentPermissions: params.customAgentPermissions ?? ethers.ZeroHash,
    allowedCallsByAgent: params.allowedCallsByAgent ?? [],
  };
}

export function buildSimpleWizardDeployParams(input: SimpleWizardDeployInput): RegistryDeployParams {
  const goal = input.goal ?? 'pay_people';
  const advanced = input.safetyLevel === 'advanced';
  const agentMode = advanced ? AgentMode.CUSTOM : SIMPLE_GOAL_MODE[goal];
  const manualExecution = !input.agentEnabled || input.executor === 'me';
  const agentAddr = input.executor === 'my_agent' && input.myAgentAddress?.trim() && ethers.isAddress(input.myAgentAddress.trim())
    ? [ethers.getAddress(input.myAgentAddress.trim())]
    : [];

  const validRecipients = input.recipients
    .filter((r) => !validateRecipient(r.address))
    .map((r) => normalizeRecipient(r.address));

  const label = input.vaultName?.trim() || SIMPLE_GOAL_LABELS[goal];
  const budgetToken = input.luksoToken?.trim() || ethers.ZeroAddress;

  // Build recipientConfigs or merchants depending on whether limits are enabled
  let merchants: string[] = [];
  let recipientConfigs: RecipientConfig[] = [];

  if (input.recipientLimitsEnabled) {
    if (input.recipientLimitMode === 'per' && input.perRecipientLimits) {
      recipientConfigs = validRecipients.map((addr) => {
        const cfg = input.perRecipientLimits![addr];
        const amount = cfg?.amount?.trim();
        const period = cfg?.period ?? input.frequency;
        return {
          recipient: addr,
          budget: amount && parseFloat(amount) > 0 ? parseBudgetToWei(amount) : BigInt(0),
          period: PERIOD_MAP[period],
        };
      });
    } else {
      // Global mode: same limit for all
      const globalAmt = input.globalRecipientLimit?.amount?.trim();
      const globalPeriod = input.globalRecipientLimit?.period ?? input.frequency;
      recipientConfigs = validRecipients.map((addr) => ({
        recipient: addr,
        budget: globalAmt && parseFloat(globalAmt) > 0 ? parseBudgetToWei(globalAmt) : BigInt(0),
        period: PERIOD_MAP[globalPeriod],
      }));
    }
  } else {
    merchants = validRecipients;
  }

  return buildRegistryDeployParams({
    budget: parseBudgetToWei(input.maxPerTx, '1'),
    period: PERIOD_MAP[input.frequency],
    budgetToken,
    merchants,
    recipientConfigs,
    label,
    agentMode,
    allowSuperPermissions: advanced && !manualExecution,
    customAgentPermissions: advanced && !manualExecution ? PERM_POWER_USER : ethers.ZeroHash,
    agents: agentAddr,
  });
}

export interface BaseSimpleDeployInput {
  vaultName?: string;
  goal: SimpleWizardGoal | null;
  recipients: RecipientEntry[];
  maxPerTx: string;
  frequency: DeployPeriodKey;
  baseToken: string;
}

export function buildBaseSimpleDeployParams(input: BaseSimpleDeployInput) {
  const goal = input.goal ?? 'pay_people';
  const merchants = input.recipients
    .filter((r) => !validateRecipient(r.address))
    .map((r) => normalizeRecipient(r.address));
  const label = input.vaultName?.trim() || SIMPLE_GOAL_LABELS[goal];
  return {
    label,
    token: input.baseToken,
    budget: parseBudgetToWei(input.maxPerTx, '1'),
    period: PERIOD_MAP[input.frequency],
    tokenBudgets: [] as Array<{ token: string; limit: bigint; period: number }>,
    expiration: BigInt(0),
    agents: [] as string[],
    agentBudgets: [] as bigint[],
    merchants,
  };
}

function extractDeployedVault(receipt: ContractTransactionReceipt, registry: RegistryContract) {
  let safe = '';
  let keyManager = '';
  let policyEngine = '';
  let label = '';

  for (const log of receipt.logs) {
    try {
      const parsed = registry.interface.parseLog(log);
      if (parsed?.name === 'VaultDeployed') {
        safe = parsed.args.safe;
        keyManager = parsed.args.keyManager;
        policyEngine = parsed.args.policyEngine;
        label = parsed.args.label ?? '';
      }
    } catch {
      // Ignore unrelated logs.
    }
  }

  return safe ? { safe, keyManager, policyEngine, label } : null;
}

export async function deployRegistryVault(options: DeployRegistryVaultOptions): Promise<{
  tx: ContractTransactionResponse;
  receipt: ContractTransactionReceipt;
  deployed: { safe: string; keyManager: string; policyEngine: string; label: string } | null;
}> {
  const tx = await options.registry.deployVault(options.params);
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error('Transaction receipt not available');
  }

  let deployed = extractDeployedVault(receipt, options.registry);
  if (!deployed && options.owner) {
    const latest = await options.registry.getVaults(options.owner);
    deployed =
      latest.find((vault) => {
        if (options.existingSafeAddresses?.has(vault.safe.toLowerCase())) return false;
        if (options.params.label && vault.label === options.params.label) return true;
        return false;
      }) ??
      latest.find((vault) => !options.existingSafeAddresses?.has(vault.safe.toLowerCase())) ??
      null;
  }

  return { tx, receipt, deployed };
}