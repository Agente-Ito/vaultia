import { Contract, Provider, Signer, ContractTransactionResponse } from 'ethers';

export type Ownable2StepContract = Contract & {
  owner(): Promise<string>;
  pendingOwner(): Promise<string>;
  acceptOwnership(): Promise<ContractTransactionResponse>;
};

// ─── Typed contract interfaces ────────────────────────────────────────────────
// Intersecting with Contract preserves queryFilter, filters, interface, etc.
// while adding compile-time types for each contract's writable/readable methods.

export type RegistryContract = Contract & {
  deployVault(params: {
    budget: bigint;
    period: number;
    budgetToken: string;
    expiration: bigint;
    agents: string[];
    agentBudgets: bigint[];
    merchants: string[];
    recipientConfigs: Array<{ recipient: string; budget: bigint; period: number }>;
    label: string;
    agentMode: number;
    allowSuperPermissions: boolean;
    customAgentPermissions: string;
    allowedCallsByAgent: Array<{ agent: string; allowedCalls: string }>;
    multisigSigners: string[];
    multisigThreshold: bigint | number;
    multisigTimeLock: bigint | number;
  }): Promise<ContractTransactionResponse>;
  enableMultisig(safe: string, signers: string[], threshold: bigint | number, timeLock: bigint | number): Promise<ContractTransactionResponse>;
  getVaults(owner: string): Promise<Array<{ safe: string; keyManager: string; policyEngine: string; multisigController: string; label: string }>>;
  getKeyManager(safe: string): Promise<string>;
  getPolicyEngine(safe: string): Promise<string>;
  safeToMultisigController(safe: string): Promise<string>;
};

export type CoordinatorContract = Contract & {
  registerAgent(agent: string, maxGasPerCall: number, allowedAutomation: boolean): Promise<ContractTransactionResponse>;
  getAgentRoles(agent: string): Promise<string[]>;
  isAgentRegistered(agent: string): Promise<boolean>;
  getAgentConfig(agent: string): Promise<[boolean, bigint, boolean]>;
  roleAdmin(): Promise<string>;
};

export type SchedulerContract = Contract & {
  owner(): Promise<string>;
  createTask(
    taskId: string,
    vault: string,
    keyManager: string,
    executeCalldata: string,
    triggerType: number,
    nextExecution: number,
    interval: number
  ): Promise<ContractTransactionResponse>;
  enableTask(taskId: string): Promise<ContractTransactionResponse>;
  disableTask(taskId: string): Promise<ContractTransactionResponse>;
  deleteTask(taskId: string): Promise<ContractTransactionResponse>;
  updateTask(taskId: string, nextExecution: number, interval: number): Promise<ContractTransactionResponse>;
  getTaskCount(): Promise<bigint>;
  getTaskIds(offset: number, limit: number): Promise<string[]>;
  getTasksForVault(vault: string): Promise<string[]>;
  getTask(taskId: string): Promise<[string, string, string, number, bigint, bigint, boolean, bigint]>;
  isExecutable(taskId: string): Promise<boolean>;
};

const RegistryAbi = [
  'function getVaults(address owner) external view returns (tuple(address safe,address keyManager,address policyEngine,address budgetPolicy,address multisigController,address merchantPolicy,address recipientBudgetPolicy,address expirationPolicy,address agentBudgetPolicy,string label)[])',
  'function getKeyManager(address safe) external view returns (address)',
  'function getPolicyEngine(address safe) external view returns (address)',
  'function safeToMultisigController(address safe) external view returns (address)',
  'function deployVault(tuple(uint256 budget,uint8 period,address budgetToken,uint256 expiration,address[] agents,uint256[] agentBudgets,address[] merchants,tuple(address recipient,uint256 budget,uint8 period)[] recipientConfigs,string label,uint8 agentMode,bool allowSuperPermissions,bytes32 customAgentPermissions,tuple(address agent,bytes allowedCalls)[] allowedCallsByAgent,address[] multisigSigners,uint256 multisigThreshold,uint256 multisigTimeLock) p) external returns (tuple(address safe,address keyManager,address policyEngine,address budgetPolicy,address multisigController,address merchantPolicy,address recipientBudgetPolicy,address expirationPolicy,address agentBudgetPolicy,string label))',
  'function enableMultisig(address safe,address[] signers,uint256 threshold,uint256 timeLock) external returns (address multisig)',
  'event VaultDeployed(address indexed owner,address indexed safe,address indexed keyManager,address policyEngine,address budgetPolicy,address multisigController,string label,uint256 chainId)',
  'event MultisigEnabled(address indexed owner,address indexed safe,address indexed multisig,uint256 signerCount,uint256 threshold,uint256 timeLock)',
];

const SafeAbi = [
  'function policyEngine() external view returns (address)',
  'function vaultKeyManager() external view returns (address)',
  'function acceptOwnership() external',
  'function execute(uint256 operation, address to, uint256 value, bytes data) external payable returns (bytes memory)',
  'function agentTransferToken(address token, address to, uint256 amount, bool allowNonLSP1Recipient, bytes tokenData) external',
  'event AgentPaymentExecuted(address indexed keyManager, address indexed to, uint256 amount)',
  'event AgentTokenPaymentExecuted(address indexed keyManager, address indexed token, address indexed to, uint256 amount)',
];

const PolicyEngineAbi = [
  'function owner() external view returns (address)',
  'function pendingOwner() external view returns (address)',
  'function acceptOwnership() external',
  'function getPolicies() external view returns (address[])',
  'function paused() external view returns (bool)',
  'function setPaused(bool _paused) external',
  'event Validated(address indexed agent, address indexed token, address indexed to, uint256 amount)',
  'event ExecutionBlocked(address indexed agent, address indexed policy, address indexed token, address to, uint256 amount, string reason)',
];

const Ownable2StepAbi = [
  'function owner() external view returns (address)',
  'function pendingOwner() external view returns (address)',
  'function acceptOwnership() external',
];

const BudgetPolicyAbi = [
  'function budget() external view returns (uint256)',
  'function spent() external view returns (uint256)',
  'function periodStart() external view returns (uint256)',
  'function periodDuration() external view returns (uint256)',
  'function budgetToken() external view returns (address)',
  'function ownerSetBudget(uint256 newBudget) external',
];

const MerchantPolicyAbi = [
  'function getMerchants() external view returns (address[])',
  'function addMerchants(address[] calldata merchants) external',
  'function removeMerchant(address merchant) external',
];

const ExpirationPolicyAbi = [
  'function expiration() external view returns (uint256)',
  'function setExpiration(uint256 newExpiration) external',
];

const AgentBudgetPolicyAbi = [
  'function agentCount() external view returns (uint256)',
  'function getPeriodDuration() external view returns (uint256)',
  'function getTimeUntilReset() external view returns (uint256)',
  'function periodStart() external view returns (uint256)',
];

const RecipientBudgetPolicyAbi = [
  'function recipientCount() external view returns (uint256)',
  'function recipientLimits(address) external view returns (bool registered, uint256 limit, uint256 spent, uint8 period, uint256 periodStart)',
  'function getRecipientRemaining(address) external view returns (uint256)',
  'function getRecipients() external view returns (address[])',
  'function setRecipientLimit(address recipient, uint256 limit, uint8 period) external',
  'function setRecipientLimitsBatch(address[] recipients, uint256[] limits, uint8[] periods) external',
  'function removeRecipient(address recipient) external',
];

const SharedBudgetPoolAbi = [
  'function createPool(bytes32 poolId, bytes32 parentPool, uint256 budget, uint8 period, address[] vaults, bytes32[] childPoolIds) external',
  'function addVaultToPool(bytes32 poolId, address vault) external',
  'function recordSpend(address vault, uint256 amount) external',
  'function wouldExceedBudget(address vault, uint256 amount) external view returns (bool)',
  'function getPool(bytes32 poolId) external view returns (uint256 budget, uint256 spent, uint256 periodStart, uint8 period, bytes32 parentPool, address[] vaultMembers, bytes32[] childPools)',
  'function getVaultPool(address vault) external view returns (bytes32)',
  'function getPoolRemaining(bytes32 poolId) external view returns (uint256)',
  'function getVaultAncestry(address vault) external view returns (bytes32[])',
  'function vaultToPool(address) external view returns (bytes32)',
  'function authorizedPolicy() external view returns (address)',
  'function setAuthorizedPolicy(address) external',
];

const VaultDirectoryAbi = [
  'function registerVault(address vault, string label, bytes32 linkedPool) external',
  'function updateVaultLabel(address vault, string newLabel) external',
  'function updatePoolLink(address vault, bytes32 newPool) external',
  'function unregisterVault(address vault) external',
  'function getVault(address vault) external view returns (address vaultAddr, string label, bytes32 linkedPool, bool registered)',
  'function getVaultLabel(address vault) external view returns (string)',
  'function getVaultPool(address vault) external view returns (bytes32)',
  'function getVaultCount() external view returns (uint256)',
  'function getVaults(uint256 offset, uint256 limit) external view returns (address[])',
  'function getAllVaults() external view returns (address[])',
  'function isVaultRegistered(address vault) external view returns (bool)',
];

// CoordinatorAbi verified against contracts/coordination/AgentCoordinator.sol
const CoordinatorAbi = [
  // Read
  'function agents(address) external view returns (bool isContract, uint256 maxGasPerCall, bool allowedAutomation)',
  'function isAgentRegistered(address) external view returns (bool)',
  'function getAgentRoles(address agent) external view returns (bytes32[])',
  'function hasCapability(address agent, bytes32 capability) external view returns (bool)',
  'function roleAdmin() external view returns (address)',
  'function hasRole(address agent, bytes32 role) external view returns (bool)',
  'function getRoleMembers(bytes32 role) external view returns (address[])',
  'function getCapabilitiesForRole(bytes32 role) external view returns (bytes32[])',
  'function getAgentConfig(address agent) external view returns (tuple(bool isContract, uint256 maxGasPerCall, bool allowedAutomation))',
  'function canBeAutomated(address agent) external view returns (bool)',
  // Write — registerAgent restricted to roleAdmin, not any caller
  'function registerAgent(address agent, uint256 maxGasPerCall, bool allowedAutomation) external',
  'function assignRole(address agent, bytes32 role, bytes32[] capabilities) external',
  'function revokeRole(address agent, bytes32 role) external',
  'function grantCapability(address agent, bytes32 capability) external',
  'function revokeCapability(address agent, bytes32 capability) external',
  'function setRoleAdmin(address newAdmin) external',
  // Events — exact signatures from AgentCoordinator.sol
  'event AgentRegistered(address indexed agent, bool isContract, uint256 maxGasPerCall, bool allowedAutomation)',
  'event RoleDefinedForAgent(address indexed agent, bytes32 indexed role, bytes32[] capabilities)',
  'event RoleRevoked(address indexed agent, bytes32 indexed role)',
  'event CapabilityGranted(address indexed agent, bytes32 indexed capability)',
  'event CapabilityRevoked(address indexed agent, bytes32 indexed capability)',
  'event RoleAdminChanged(address indexed oldAdmin, address indexed newAdmin)',
];

// SchedulerAbi verified against contracts/automation/TaskScheduler.sol
// NOTE: createTask and enableTask/disableTask are onlyOwner — the dApp user must be
// the TaskScheduler owner to call these. In practice, a vault owner deploys their own
// TaskScheduler instance.
const SchedulerAbi = [
  // Read
  'function owner() external view returns (address)',
  'function getTask(bytes32 taskId) external view returns (address vault, address keyManager, bytes executeCalldata, uint8 triggerType, uint256 nextExecution, uint256 interval, bool enabled, uint256 createdAt)',
  'function getTaskCount() external view returns (uint256)',
  'function getTaskIds(uint256 offset, uint256 limit) external view returns (bytes32[])',
  'function getTasksForVault(address vault) external view returns (bytes32[])',
  'function isExecutable(bytes32 taskId) external view returns (bool)',
  'function keeperWhitelistEnabled() external view returns (bool)',
  'function getEligibleTasks() external view returns (bytes32[])',
  // Write (onlyOwner)
  'function createTask(bytes32 taskId, address vault, address keyManager, bytes executeCalldata, uint8 triggerType, uint256 nextExecution, uint256 interval) external returns (bytes32)',
  'function enableTask(bytes32 taskId) external',
  'function disableTask(bytes32 taskId) external',
  'function deleteTask(bytes32 taskId) external',
  'function updateTask(bytes32 taskId, uint256 newNextExecution, uint256 newInterval) external',
  // Execute (public, keeper-compatible) — NOT payable; vault funds its own payments
  'function executeTask(bytes32 taskId) external returns (bool success)',
  // Events — exact signatures from TaskScheduler.sol
  'event TaskCreated(bytes32 indexed taskId, address indexed vault, address indexed keyManager, uint8 triggerType, uint256 nextExecution, uint256 interval)',
  'event TaskExecuted(bytes32 indexed taskId, uint256 newNextExecution, uint256 executedAt)',
  'event TaskEnabled(bytes32 indexed taskId)',
  'event TaskDisabled(bytes32 indexed taskId)',
  'event TaskUpdated(bytes32 indexed taskId, uint256 newNextExecution, uint256 newInterval)',
];

export const getRegistryContract = (address: string, provider: Provider | Signer): RegistryContract =>
  new Contract(address, RegistryAbi, provider) as RegistryContract;

export const getSafeContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, SafeAbi, provider);

export const getPolicyEngineContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, PolicyEngineAbi, provider);

export const getOwnable2StepContract = (address: string, provider: Provider | Signer): Ownable2StepContract =>
  new Contract(address, Ownable2StepAbi, provider) as Ownable2StepContract;

export const getBudgetPolicyContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, BudgetPolicyAbi, provider);

export const getMerchantPolicyContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, MerchantPolicyAbi, provider);

export const getExpirationPolicyContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, ExpirationPolicyAbi, provider);

export const getAgentBudgetPolicyContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, AgentBudgetPolicyAbi, provider);

export const getRecipientBudgetPolicyContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, RecipientBudgetPolicyAbi, provider);

export const getSharedBudgetPoolContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, SharedBudgetPoolAbi, provider);

export const getVaultDirectoryContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, VaultDirectoryAbi, provider);

export const getKeyManagerContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, [
    'function target() external view returns (address)',
    'function execute(bytes _data) external returns (bytes)',
  ], provider);

export const getCoordinatorContract = (address: string, provider: Provider | Signer): CoordinatorContract =>
  new Contract(address, CoordinatorAbi, provider) as CoordinatorContract;

export const getSchedulerContract = (address: string, provider: Provider | Signer): SchedulerContract =>
  new Contract(address, SchedulerAbi, provider) as SchedulerContract;

const LSP7DemoTokenAbi = [
  'function mint(address to, uint256 amount) external',
  'function balanceOf(address account) external view returns (uint256)',
];

const MerchantRegistryAbi = [
  'function register(string calldata name) external',
  'function getName(address merchant) external view returns (string)',
  'function isRegistered(address merchant) external view returns (bool)',
  'function merchantNames(address) external view returns (string)',
];

export const getLSP7DemoTokenContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, LSP7DemoTokenAbi, provider);

export const getMerchantRegistryContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, MerchantRegistryAbi, provider);
