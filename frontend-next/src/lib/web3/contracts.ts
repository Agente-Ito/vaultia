import { Contract, Provider, Signer, ContractTransactionResponse } from 'ethers';

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
    label: string;
  }): Promise<ContractTransactionResponse>;
  getVaults(owner: string): Promise<Array<{ safe: string; keyManager: string; policyEngine: string; label: string }>>;
  getKeyManager(safe: string): Promise<string>;
  getPolicyEngine(safe: string): Promise<string>;
};

export type CoordinatorContract = Contract & {
  registerAgent(agent: string, maxGasPerCall: number, allowedAutomation: boolean): Promise<ContractTransactionResponse>;
  getAgentRoles(agent: string): Promise<string[]>;
  isAgentRegistered(agent: string): Promise<boolean>;
};

export type SchedulerContract = Contract & {
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
  getTaskCount(): Promise<bigint>;
  getTaskIds(offset: number, limit: number): Promise<string[]>;
  getTask(taskId: string): Promise<[string, string, string, number, bigint, bigint, boolean, bigint]>;
  isExecutable(taskId: string): Promise<boolean>;
};

const RegistryAbi = [
  'function getVaults(address owner) external view returns (tuple(address safe,address keyManager,address policyEngine,string label)[])',
  'function getKeyManager(address safe) external view returns (address)',
  'function getPolicyEngine(address safe) external view returns (address)',
  'function deployVault(tuple(uint256 budget,uint8 period,address budgetToken,uint256 expiration,address[] agents,uint256[] agentBudgets,address[] merchants,string label) p) external returns (tuple(address safe,address keyManager,address policyEngine,string label))',
  'event VaultDeployed(address indexed owner,address indexed safe,address indexed keyManager,address policyEngine,string label,uint256 chainId)',
];

const SafeAbi = [
  'function policyEngine() external view returns (address)',
  'function vaultKeyManager() external view returns (address)',
  'function acceptOwnership() external',
  'function execute(uint256 operation, address to, uint256 value, bytes data) external payable returns (bytes memory)',
  'event AgentPaymentExecuted(address indexed keyManager, address indexed to, uint256 amount)',
  'event AgentTokenPaymentExecuted(address indexed keyManager, address indexed token, address indexed to, uint256 amount)',
];

const PolicyEngineAbi = [
  'function getPolicies() external view returns (address[])',
];

const BudgetPolicyAbi = [
  'function budget() external view returns (uint256)',
  'function spent() external view returns (uint256)',
  'function periodStart() external view returns (uint256)',
  'function budgetToken() external view returns (address)',
];

const MerchantPolicyAbi = [
  'function getMerchants() external view returns (address[])',
];

const ExpirationPolicyAbi = [
  'function expiration() external view returns (uint256)',
];

const AgentBudgetPolicyAbi = [
  'function agentCount() external view returns (uint256)',
  'function getPeriodDuration() external view returns (uint256)',
  'function getTimeUntilReset() external view returns (uint256)',
  'function periodStart() external view returns (uint256)',
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

export const getBudgetPolicyContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, BudgetPolicyAbi, provider);

export const getMerchantPolicyContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, MerchantPolicyAbi, provider);

export const getExpirationPolicyContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, ExpirationPolicyAbi, provider);

export const getAgentBudgetPolicyContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, AgentBudgetPolicyAbi, provider);

export const getKeyManagerContract = (address: string, provider: Provider | Signer) =>
  new Contract(address, [
    'function target() external view returns (address)',
    'function execute(bytes _data) external returns (bytes)',
  ], provider);

export const getCoordinatorContract = (address: string, provider: Provider | Signer): CoordinatorContract =>
  new Contract(address, CoordinatorAbi, provider) as CoordinatorContract;

export const getSchedulerContract = (address: string, provider: Provider | Signer): SchedulerContract =>
  new Contract(address, SchedulerAbi, provider) as SchedulerContract;
