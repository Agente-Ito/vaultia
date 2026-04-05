import { ethers } from 'ethers';
import type { ContractTransactionReceipt, ContractTransactionResponse } from 'ethers';
import { getOwnable2StepContract, getPolicyEngineContract, getSafeContract, type RegistryContract } from '@/lib/web3/contracts';
import type { RecipientEntry } from '@/context/OnboardingContext';
import { removePendingMultisigSetup } from '@/lib/pendingMultisigSetup';

const LEGACY_REGISTRY_DEPLOY_ABI = [
  'function deployVault(tuple(uint256 budget,uint8 period,address budgetToken,uint256 expiration,address[] agents,uint256[] agentBudgets,address[] merchants,tuple(address recipient,uint256 budget,uint8 period)[] recipientConfigs,string label,uint8 agentMode,bool allowSuperPermissions,bytes32 customAgentPermissions,tuple(address agent,bytes allowedCalls)[] allowedCallsByAgent) p) external returns (tuple(address safe,address keyManager,address policyEngine,string label))',
  'function getVaults(address owner) external view returns (tuple(address safe,address keyManager,address policyEngine,string label)[])',
];

const LEGACY_VAULT_DEPLOYED_EVENT_INTERFACE = new ethers.Interface([
  'event VaultDeployed(address indexed owner,address indexed safe,address indexed keyManager,address policyEngine,string label,uint256 chainId)',
]);

const CURRENT_VAULT_DEPLOYED_EVENT_INTERFACE = new ethers.Interface([
  'event VaultDeployed(address indexed owner,address indexed safe,address indexed keyManager,address policyEngine,address budgetPolicy,address multisigController,string label,uint256 chainId)',
]);

export const AgentMode = {
  STRICT_PAYMENTS: 0,
  SUBSCRIPTIONS: 1,
  TREASURY_BALANCED: 2,
  OPS_ADMIN: 3,
  CUSTOM: 4,
} as const;

const LSP14_ERRORS_INTERFACE = new ethers.Interface([
  'error LSP14CallerNotPendingOwner(address caller)',
  'error LSP14MustAcceptOwnershipInSeparateTransaction()',
]);

const ACCOUNT_BATCH_EXECUTOR_ABI = [
  'function executeBatch(uint256[] operationsType,address[] targets,uint256[] values,bytes[] datas) external payable returns (bytes[])',
];

const ACCEPT_OWNERSHIP_INTERFACE = new ethers.Interface([
  'function acceptOwnership()',
]);

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
  multisigSigners: string[];
  multisigThreshold: number;
  multisigTimeLock: number;
}

interface LegacyRegistryDeployParams {
  budget: bigint;
  period: number;
  budgetToken: string;
  expiration: bigint;
  agents: string[];
  agentBudgets: bigint[];
  merchants: string[];
  recipientConfigs: RecipientConfig[];
  label: string;
  agentMode: number;
  allowSuperPermissions: boolean;
  customAgentPermissions: string;
  allowedCallsByAgent: Array<{ agent: string; allowedCalls: string }>;
}

export type VaultDeployPhase =
  | 'tx_pending'
  | 'tx_confirming'
  | 'multisig_pending'
  | 'multisig_confirming'
  | 'ownership_batch'
  | 'ownership_fallback'
  | 'verifying'
  | 'done';

export type VaultProgressCallback = (phase: VaultDeployPhase, detail?: string) => void;

export interface DeployRegistryVaultOptions {
  registry: RegistryContract;
  params: RegistryDeployParams;
  owner?: string;
  existingSafeAddresses?: Set<string>;
  onProgress?: VaultProgressCallback;
  deferOwnershipFinalization?: boolean;
}

export interface DeployedVaultSummary {
  safe: string;
  keyManager: string;
  policyEngine: string;
  label: string;
}

export interface RegistryVaultDeploymentResult {
  tx: ContractTransactionResponse;
  receipt: ContractTransactionReceipt;
  deployed: DeployedVaultSummary | null;
  ownershipWarnings: string[];
}

export interface EnableVaultMultisigOptions {
  registry: RegistryContract;
  safeAddress: string;
  signers: string[];
  threshold: number;
  timeLock: number;
  onProgress?: VaultProgressCallback;
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
  controllerMode?: 'single' | 'multisig';
  deferMultisigActivation?: boolean;
  multisigConfig?: {
    signers: string[];
    threshold: number;
    timelockHours: number;
  };
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
    multisigSigners: params.multisigSigners ?? [],
    multisigThreshold: params.multisigThreshold ?? 0,
    multisigTimeLock: params.multisigTimeLock ?? 0,
  };
}

export function buildSimpleWizardDeployParams(input: SimpleWizardDeployInput): RegistryDeployParams {
  const goal = input.goal ?? 'pay_people';
  const enableMultisigOnDeploy = input.controllerMode === 'multisig' && !input.deferMultisigActivation;
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
    multisigSigners: enableMultisigOnDeploy ? (input.multisigConfig?.signers ?? []) : [],
    multisigThreshold: enableMultisigOnDeploy ? (input.multisigConfig?.threshold ?? 0) : 0,
    multisigTimeLock: enableMultisigOnDeploy ? ((input.multisigConfig?.timelockHours ?? 0) * 3600) : 0,
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
      const parsed = CURRENT_VAULT_DEPLOYED_EVENT_INTERFACE.parseLog(log) ?? registry.interface.parseLog(log);
      if (parsed?.name === 'VaultDeployed') {
        safe = parsed.args.safe;
        keyManager = parsed.args.keyManager;
        policyEngine = parsed.args.policyEngine;
        label = parsed.args.label ?? '';
      }
    } catch {
      try {
        const parsed = LEGACY_VAULT_DEPLOYED_EVENT_INTERFACE.parseLog(log);
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
  }

  return safe ? { safe, keyManager, policyEngine, label } : null;
}

async function supportsCurrentRegistryDeploy(registry: RegistryContract): Promise<boolean> {
  const probe = new ethers.Contract(
    registry.target,
    ['function safeToMultisigController(address) view returns (address)'],
    registry.runner
  );

  try {
    await probe.safeToMultisigController(ethers.ZeroAddress);
    return true;
  } catch {
    return false;
  }
}

export async function supportsMultisigVaultDeploy(registry: RegistryContract): Promise<boolean> {
  return supportsCurrentRegistryDeploy(registry);
}

export async function supportsStagedMultisigActivation(registry: RegistryContract): Promise<boolean> {
  const probe = new ethers.Contract(
    registry.target,
    ['function enableMultisig(address safe,address[] signers,uint256 threshold,uint256 timeLock) returns (address)'],
    registry.runner
  );

  try {
    await probe.enableMultisig.staticCall(ethers.ZeroAddress, [], 0, 0);
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('Registry: zero safe') ||
      message.includes('Registry: unknown safe') ||
      message.includes('Registry: not designated owner') ||
      message.includes('execution reverted')
    ) {
      return true;
    }
    return false;
  }
}

async function readVaultsCompat(registry: RegistryContract, owner: string) {
  try {
    return await registry.getVaults(owner);
  } catch {
    const legacyRegistry = new ethers.Contract(registry.target, LEGACY_REGISTRY_DEPLOY_ABI, registry.runner);
    return await legacyRegistry.getVaults(owner) as Array<{ safe: string; keyManager: string; policyEngine: string; label: string }>;
  }
}

export async function recoverDeployedVaultCandidate(
  registry: RegistryContract,
  owner: string,
  existingSafeAddresses?: Set<string>,
  label?: string
): Promise<DeployedVaultSummary | null> {
  const latest = await readVaultsCompat(registry, owner);

  return (
    latest.find((vault) => {
      if (existingSafeAddresses?.has(vault.safe.toLowerCase())) return false;
      if (label && vault.label === label) return true;
      return false;
    }) ??
    latest.find((vault) => !existingSafeAddresses?.has(vault.safe.toLowerCase())) ??
    null
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForRecoveredDeployedVaultCandidate(
  registry: RegistryContract,
  owner: string,
  existingSafeAddresses?: Set<string>,
  label?: string,
  options?: { attempts?: number; intervalMs?: number }
): Promise<DeployedVaultSummary | null> {
  const attempts = options?.attempts ?? 10;
  const intervalMs = options?.intervalMs ?? 2500;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const recovered = await recoverDeployedVaultCandidate(registry, owner, existingSafeAddresses, label);
    if (recovered) return recovered;
    if (attempt < attempts - 1) {
      await delay(intervalMs);
    }
  }

  return null;
}

function getErrorData(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = error as {
    data?: unknown;
    error?: unknown;
    info?: { error?: { data?: unknown } };
  };

  if (typeof candidate.data === 'string') {
    return candidate.data;
  }

  if (candidate.error && typeof candidate.error === 'object' && 'data' in candidate.error) {
    const nestedData = (candidate.error as { data?: unknown }).data;
    if (typeof nestedData === 'string') {
      return nestedData;
    }
  }

  if (typeof candidate.info?.error?.data === 'string') {
    return candidate.info.error.data;
  }

  return null;
}

function formatAcceptOwnershipError(
  contractAddress: string,
  pendingOwner: string,
  signerAddress: string,
  error: unknown
) {
  const errorData = getErrorData(error);

  if (errorData) {
    try {
      const parsed = LSP14_ERRORS_INTERFACE.parseError(errorData);
      if (parsed?.name === 'LSP14CallerNotPendingOwner') {
        const caller = String(parsed.args.caller);
        return `Automatic acceptOwnership failed for ${contractAddress}: wallet/provider sent the transaction as ${caller}, but the pending owner is ${pendingOwner}. Reconnect the wallet/profile that deployed the vault and retry.`;
      }
      if (parsed?.name === 'LSP14MustAcceptOwnershipInSeparateTransaction') {
        return `Automatic acceptOwnership failed for ${contractAddress}: the owner must accept ownership in a separate transaction. Retry once the deployment transaction is fully settled.`;
      }
    } catch {
      // Fall back to the generic error message below.
    }
  }

  const reason = error instanceof Error ? error.message : String(error);
  return `Automatic acceptOwnership failed for ${contractAddress}: signer ${signerAddress}, pending owner ${pendingOwner}. ${reason}`;
}

/**
 * Checks whether a contract address still needs acceptOwnership from `ownerAddress`.
 * Returns the contract address if pending, null otherwise.
 */
async function getPendingOwnershipAddress(
  contractAddress: string,
  ownerAddress: string,
  signer: ethers.Signer
): Promise<string | null> {
  const contract = getOwnable2StepContract(contractAddress, signer);
  try {
    const currentOwner = await contract.owner();
    if (currentOwner.toLowerCase() === ownerAddress.toLowerCase()) return null;
    const pendingOwner = await contract.pendingOwner();
    if (pendingOwner.toLowerCase() !== ownerAddress.toLowerCase()) return null;
    return contractAddress;
  } catch {
    return null;
  }
}

async function finalizeVaultOwnership(
  registry: RegistryContract,
  deployed: { safe: string; keyManager: string; policyEngine: string; label: string } | null,
  owner?: string,
  onProgress?: VaultProgressCallback
) {
  const warnings: string[] = [];

  if (!deployed || !owner) return warnings;

  const runner = registry.runner;
  if (!runner || !("getAddress" in runner)) {
    warnings.push('Registry signer unavailable for ownership finalization.');
    return warnings;
  }

  const signer = runner as ethers.Signer;
  const signerAddress = await signer.getAddress();

  // Collect all contracts that need acceptOwnership (in parallel)
  const policyEngine = getPolicyEngineContract(deployed.policyEngine, signer) as ReturnType<typeof getPolicyEngineContract> & {
    getPolicies(): Promise<string[]>;
  };

  let policyAddresses: string[] = [];
  try {
    policyAddresses = await policyEngine.getPolicies();
  } catch (error: unknown) {
    warnings.push(`Could not enumerate policies for ownership finalization: ${error instanceof Error ? error.message : String(error)}`);
  }

  const allContracts = [deployed.safe, deployed.policyEngine, ...policyAddresses];

  const pendingResults = await Promise.all(
    allContracts.map((addr) => getPendingOwnershipAddress(addr, owner, signer))
  );
  const pendingContracts = pendingResults.filter((addr): addr is string => addr !== null);

  if (pendingContracts.length === 0) return warnings;

  // Determine whether owner is a UP (contract) or EOA
  const provider = signer.provider;
  const ownerCode = provider ? await provider.getCode(owner) : '0x';
  const ownerIsProfile = ownerCode !== '0x';

  if (ownerIsProfile && signerAddress.toLowerCase() === owner.toLowerCase()) {
    try {
      onProgress?.('ownership_batch');
      await batchAcceptOwnershipWithProfile(owner, signer, pendingContracts);
      warnings.push('[[ownership_batch_success]]');
      return warnings;
    } catch (error: unknown) {
      warnings.push(`[[ownership_batch_fallback]] ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ── Automatic acceptOwnership: separate tx per contract ───────────────────
  onProgress?.('ownership_fallback');
  for (const contractAddress of pendingContracts) {
    try {
      if (ownerIsProfile && signerAddress.toLowerCase() !== owner.toLowerCase()) {
        warnings.push(`Ownership for ${contractAddress} pending on profile ${owner}. Reconnect that profile and retry.`);
        continue;
      }
      if (!ownerIsProfile && signerAddress.toLowerCase() !== owner.toLowerCase()) {
        warnings.push(`Automatic acceptOwnership skipped for ${contractAddress}: connected signer ${signerAddress} is not the pending owner ${owner}.`);
        continue;
      }
      const contract = getOwnable2StepContract(contractAddress, signer);
      const tx = await contract.acceptOwnership();
      await tx.wait();
    } catch (error: unknown) {
      warnings.push(formatAcceptOwnershipError(contractAddress, owner, signerAddress, error));
    }
  }

  return warnings;
}

export async function finalizeDeployedVaultOwnership(
  registry: RegistryContract,
  deployed: DeployedVaultSummary | null,
  owner?: string,
  onProgress?: VaultProgressCallback
) {
  return finalizeVaultOwnership(registry, deployed, owner, onProgress);
}

export async function enableVaultMultisig(options: EnableVaultMultisigOptions): Promise<{
  tx: ContractTransactionResponse;
  receipt: ContractTransactionReceipt;
  multisigAddress: string;
}> {
  options.onProgress?.('multisig_pending');
  const tx = await options.registry.enableMultisig(
    options.safeAddress,
    options.signers,
    options.threshold,
    options.timeLock
  );
  options.onProgress?.('multisig_confirming');
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error('Multisig activation receipt not available');
  }

  const multisigAddress = await options.registry.safeToMultisigController(options.safeAddress);
  if (!multisigAddress || multisigAddress === ethers.ZeroAddress) {
    throw new Error('Multisig activation completed, but the controller address could not be recovered from the registry.');
  }

  return { tx, receipt, multisigAddress };
}

export async function deployRegistryVault(options: DeployRegistryVaultOptions): Promise<RegistryVaultDeploymentResult> {
  options.onProgress?.('tx_pending');
  const supportsCurrentDeploy = await supportsCurrentRegistryDeploy(options.registry);

  if (!supportsCurrentDeploy && options.params.multisigSigners.length > 0) {
    throw new Error('This deployed registry does not support multisig vault creation yet. Create the vault as single-signer or use a newer registry deployment.');
  }

  const tx = supportsCurrentDeploy
    ? await options.registry.deployVault(options.params)
    : await new ethers.Contract(options.registry.target, LEGACY_REGISTRY_DEPLOY_ABI, options.registry.runner).deployVault({
        budget: options.params.budget,
        period: options.params.period,
        budgetToken: options.params.budgetToken,
        expiration: options.params.expiration,
        agents: options.params.agents,
        agentBudgets: options.params.agentBudgets,
        merchants: options.params.merchants,
        recipientConfigs: options.params.recipientConfigs,
        label: options.params.label,
        agentMode: options.params.agentMode,
        allowSuperPermissions: options.params.allowSuperPermissions,
        customAgentPermissions: options.params.customAgentPermissions,
        allowedCallsByAgent: options.params.allowedCallsByAgent,
      } satisfies LegacyRegistryDeployParams);
  options.onProgress?.('tx_confirming');
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error('Transaction receipt not available');
  }

  let deployed = extractDeployedVault(receipt, options.registry);
  if (!deployed && options.owner) {
    deployed = await recoverDeployedVaultCandidate(
      options.registry,
      options.owner,
      options.existingSafeAddresses,
      options.params.label
    );
  }

  const ownershipWarnings = options.deferOwnershipFinalization
    ? []
    : await finalizeVaultOwnership(options.registry, deployed, options.owner, options.onProgress);

  return { tx, receipt, deployed, ownershipWarnings };
}

// ─── Standalone ownership utilities (for recovery / UI) ───────────────────────

/**
 * Returns whether the user is the current owner, pending owner, or unrelated to a vault's safe.
 * Uses the safe address to represent the vault (all vault contracts share the same owner chain).
 */
export async function checkVaultOwnership(
  safeAddress: string,
  userAddress: string,
  provider: ethers.Provider
): Promise<'owner' | 'pending' | 'none'> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = getOwnable2StepContract(safeAddress, provider) as any;
    const owner: string = await c.owner();
    if (owner.toLowerCase() === userAddress.toLowerCase()) return 'owner';
    const pending: string = await c.pendingOwner();
    if (pending.toLowerCase() === userAddress.toLowerCase()) return 'pending';
  } catch {
    // contract may not support pendingOwner (non-LSP14) — treat as not related
  }
  return 'none';
}

/**
 * Accepts pending ownership for all contracts in a vault (safe, policyEngine, policies).
 * Sends individual acceptOwnership() transactions so the UP extension wraps each call correctly.
 * Returns the number of contracts claimed and any per-contract warnings.
 */
export async function claimVaultOwnership(
  safeAddress: string,
  signer: ethers.Signer
): Promise<{ claimed: number; warnings: string[] }> {
  const warnings: string[] = [];
  const signerAddress = await signer.getAddress();

  // Enumerate all vault contracts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeC = getSafeContract(safeAddress, signer) as any;
  let policyEngineAddr = '';
  try { policyEngineAddr = await safeC.policyEngine(); } catch { /* best-effort */ }

  let policyAddresses: string[] = [];
  if (policyEngineAddr) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pe = getPolicyEngineContract(policyEngineAddr, signer) as any;
      policyAddresses = await pe.getPolicies();
    } catch { /* best-effort */ }
  }

  const allContracts = [
    safeAddress,
    ...(policyEngineAddr ? [policyEngineAddr] : []),
    ...policyAddresses,
  ];

  const pendingContracts: string[] = [];
  for (const addr of allContracts) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = getOwnable2StepContract(addr, signer) as any;
      const pending: string = await c.pendingOwner();
      if (pending.toLowerCase() === signerAddress.toLowerCase()) {
        pendingContracts.push(addr);
      }
    } catch {
      // best effort only
    }
  }

  const signerCode = signer.provider ? await signer.provider.getCode(signerAddress) : '0x';
  const signerIsProfile = signerCode !== '0x';

  let claimed = 0;
  if (signerIsProfile && pendingContracts.length > 0) {
    try {
      await batchAcceptOwnershipWithProfile(signerAddress, signer, pendingContracts);
      claimed = pendingContracts.length;
      warnings.push('[[ownership_batch_success]]');
    } catch (error: unknown) {
      warnings.push(`[[ownership_batch_fallback]] ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (claimed > 0) {
    removePendingMultisigSetup(safeAddress);
    return { claimed, warnings };
  }

  for (const addr of allContracts) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = getOwnable2StepContract(addr, signer) as any;
      const pending: string = await c.pendingOwner();
      if (pending.toLowerCase() !== signerAddress.toLowerCase()) continue;
      const tx = await c.acceptOwnership();
      await tx.wait();
      claimed++;
    } catch (e: unknown) {
      warnings.push(`${addr.slice(0, 10)}…: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (claimed > 0) {
    removePendingMultisigSetup(safeAddress);
  }
  return { claimed, warnings };
}

async function batchAcceptOwnershipWithProfile(
  profileAddress: string,
  signer: ethers.Signer,
  contractAddresses: string[]
) {
  if (contractAddresses.length === 0) return;

  const profile = new ethers.Contract(profileAddress, ACCOUNT_BATCH_EXECUTOR_ABI, signer);
  const operations = contractAddresses.map(() => 0);
  const values = contractAddresses.map(() => 0);
  const payloads = contractAddresses.map(() => ACCEPT_OWNERSHIP_INTERFACE.encodeFunctionData('acceptOwnership'));

  const tx = await profile.executeBatch(operations, contractAddresses, values, payloads);
  await tx.wait();
}