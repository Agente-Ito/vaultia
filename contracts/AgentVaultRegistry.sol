// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AgentVaultDeployerCore} from "./AgentVaultDeployerCore.sol";
import {AgentVaultDeployer} from "./AgentVaultDeployer.sol";
import {AgentVaultOptionalPolicyDeployer} from "./AgentVaultOptionalPolicyDeployer.sol";
import {AgentKMDeployer} from "./AgentKMDeployer.sol";
import {MultisigControllerDeployer} from "./MultisigControllerDeployer.sol";
import {BudgetPolicy} from "./policies/BudgetPolicy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LSP6KeyLib} from "./libraries/LSP6KeyLib.sol";

// ─── Lightweight interfaces for post-deployment callbacks ─────────────────────

interface IAgentSafe {
    function setData(bytes32 key, bytes memory value) external;
    function getData(bytes32 key) external view returns (bytes memory);
    function setPolicyEngine(address pe) external;
    function setKeyManager(address km) external;
    function transferOwnership(address newOwner) external;
}

interface IPolicyEngine {
    function addPolicy(address policy) external;
    function transferOwnership(address newOwner) external;
}

interface IBudgetPolicy {
    function periodStart() external view returns (uint256);
    function transferOwnership(address newOwner) external;
}

interface IMerchantPolicy {
    function addMerchants(address[] calldata merchants) external;
    function transferOwnership(address newOwner) external;
}

interface IExpirationPolicy {
    function transferOwnership(address newOwner) external;
}

interface IAgentBudgetPolicy {
    function setAgentBudget(address agent, uint256 budget) external;
    function syncPeriodStart(uint256 start) external;
    function transferOwnership(address newOwner) external;
}

interface IRecipientBudgetPolicy {
    function setRecipientLimit(address recipient, uint256 limit, BudgetPolicy.Period period) external;
    function transferOwnership(address newOwner) external;
}

interface IPendingOwnable {
    function pendingOwner() external view returns (address);
}

interface IOwned {
    function owner() external view returns (address);
}

// ─── Coordinator interface ────────────────────────────────────────────────────

interface IAgentCoordinator {
    function hasCapability(address agent, bytes32 cap) external view returns (bool);
    function getDelegationDepth(address agent) external view returns (uint256);
    function isSubset(address agent, bytes32[] calldata caps) external view returns (bool);
    function isAgentRegistered(address agent) external view returns (bool);
    function registerAgent(address agent, uint256 maxGas, bool allowAutomation) external;
    function assignRole(address agent, bytes32 role, bytes32[] calldata caps) external;
    function setDelegationDepth(address agent, uint256 depth) external;
    function MAX_DELEGATION_DEPTH() external view returns (uint256);
    function CAN_DEPLOY() external view returns (bytes32);
}

// ─── SharedBudgetPool interface ───────────────────────────────────────────────

interface ISharedBudgetPool {
    enum Period { DAILY, WEEKLY, MONTHLY }
    function getVaultPool(address vault) external view returns (bytes32);
    function getPoolRemaining(bytes32 poolId) external view returns (uint256);
    function createPool(
        bytes32 poolId,
        bytes32 parentPool,
        uint256 budget,
        Period period,
        address[] calldata vaults,
        bytes32[] calldata childPoolIds
    ) external;
}

/// @title AgentVaultRegistry
/// @notice Factory contract that atomically deploys one complete vault stack per call:
///         AgentSafe + PolicyEngine + BudgetPolicy + optional AgentBudgetPolicy
///         + optional MerchantPolicy + optional ExpirationPolicy + LSP6KeyManager.
///
///         Hybrid budget model:
///         - BudgetPolicy: vault-level budget (global limit)
///         - AgentBudgetPolicy: agent-level budgets (individual limits per agent)
///
///         After deployment, factory calls transferOwnership(user) on each contract.
///         User must call acceptOwnership() on AgentSafe, PolicyEngine, and every
///         deployed policy contract to finalize LSP14 two-step ownership.
///         AgentSafe uses LSP14 two-step ownership via LSP9Vault. PolicyEngine and the
///         user-owned policy contracts also use LSP14 two-step ownership directly.
///
///         All `new` calls are delegated to AgentVaultDeployerCore and AgentVaultDeployer
///         so this contract embeds no creation bytecode and stays under EIP-170.
///
///         FIX #26: simple mapping(address => VaultRecord[]) — one per chain deployment.
///                  Cross-chain indexing via chainId field in VaultDeployed event.
contract AgentVaultRegistry is Ownable {

    /// @dev Minimum gas required for a full vault deployment (7-8 contract creations).
    /// Measured empirically: ~3.2M gas worst-case. 4M provides a 25% safety margin.
    uint256 private constant MINIMUM_DEPLOYMENT_GAS = 4_000_000;

    /// @dev Minimum gas required for deployForAgent() which layers coordinator + pool calls
    ///      on top of the standard vault deployment stack. Measured at ~5M worst-case;
    ///      5.5M provides a 10% margin. Always provide this when calling deployForAgent().
    uint256 public constant MIN_GAS_FOR_DEPLOY_FOR_AGENT = 5_500_000;

    error InsufficientGasForDeployment(uint256 available, uint256 required);

    AgentVaultDeployerCore        public immutable core;
    AgentVaultDeployer            public immutable deployer;
    AgentVaultOptionalPolicyDeployer public immutable optionalDeployer;
    AgentKMDeployer               public immutable kmDeployer;
    MultisigControllerDeployer    public immutable msDeployer;

    /// @notice The AgentCoordinator that tracks agent capabilities and delegation depth.
    ///         Required for deployForAgent() to validate and register agents atomically.
    IAgentCoordinator public immutable coordinator;

    /// @notice The SharedBudgetPool that manages hierarchical vault budgets.
    ///         Required for deployForAgent() to carve a child pool from the deploying
    ///         agent's own remaining budget — the constraint that makes autonomous
    ///         deployment safe.
    ISharedBudgetPool public immutable pool;

    /// @dev Addresses allowed to call deployVaultOnBehalf (e.g. TemplateFactory).
    ///      Only the registry owner can grant/revoke authorization.
    mapping(address => bool) public authorizedCallers;

    /// @dev Inverse index: role address → vault addresses where they have a role.
    ///      Populated during deployment and via AgentCoordinator/MultisigController callbacks.
    mapping(address => address[]) internal _agentVaults;
    mapping(address => address[]) internal _signerVaults;

    /// @dev Addresses authorized to call registerAgentForVault / registerSignerForVault.
    ///      Includes the coordinator (set in constructor) and each deployed MultisigController
    ///      (added automatically in _installMultisig).
    mapping(address => bool) public registryOperators;

    /// @dev LSP3 standard profile key — makes vaults searchable by name in the LUKSO ecosystem.
    bytes32 private constant LSP3_PROFILE_KEY =
        0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5;

    event CallerAuthorizationChanged(address indexed caller, bool authorized);
    event RegistryOperatorChanged(address indexed op, bool enabled);

    /// @notice Emitted after every ERC725Y setData call for forensics and sync verification.
    ///         Allows off-chain tools and support to detect storage mismatches.
    /// @param key          The ERC725Y data key that was written
    /// @param safeAddr     The AgentSafe contract address
    /// @param intended     keccak256 of the value passed to setData()
    /// @param observed     keccak256 of the value read back via getData() immediately after
    event DiagnosticWrite(
        bytes32 indexed key,
        address indexed safeAddr,
        bytes32 intended,
        bytes32 observed
    );

    /// @dev LSP2 MappingWithGrouping prefix for AddressPermissions:Permissions:<address>.
    ///      bytes10(keccak256("AddressPermissions:Permissions")) truncated to first 10 bytes.
    ///      Source: https://github.com/lukso-network/LIPs/blob/main/LSPs/LSP-6-KeyManager.md
    bytes10 private constant LSP6_PERMISSIONS_PREFIX = bytes10(0x4b80742de2bf82acb363);

    /// @dev LSP2 Array key for AddressPermissions[].
    ///      = keccak256("AddressPermissions[]") = 0xdf30dba06db6a30e65354d9a64c609861f089545ca58c6b4dbe31a5f338cb0e3
    bytes32 private constant AP_ARRAY_KEY =
        0xdf30dba06db6a30e65354d9a64c609861f089545ca58c6b4dbe31a5f338cb0e3;

    /// @dev First 16 bytes of AP_ARRAY_KEY — combined with bytes16(uint128(index)) for element keys.
    bytes16 private constant AP_ARRAY_KEY_PREFIX = 0xdf30dba06db6a30e65354d9a64c60986;

    constructor(
        address _core,
        address _deployer,
        address _optionalDeployer,
        address _km,
        address _coordinator,
        address _pool,
        address _multisigDeployer
    ) Ownable() {
        require(_core             != address(0), "Registry: zero core");
        require(_deployer         != address(0), "Registry: zero deployer");
        require(_optionalDeployer != address(0), "Registry: zero optional deployer");
        require(_km               != address(0), "Registry: zero km");
        require(_coordinator      != address(0), "Registry: zero coordinator");
        require(_pool             != address(0), "Registry: zero pool");
        require(_multisigDeployer != address(0), "Registry: zero ms deployer");
        core             = AgentVaultDeployerCore(_core);
        deployer         = AgentVaultDeployer(_deployer);
        optionalDeployer = AgentVaultOptionalPolicyDeployer(_optionalDeployer);
        kmDeployer       = AgentKMDeployer(_km);
        coordinator      = IAgentCoordinator(_coordinator);
        pool             = ISharedBudgetPool(_pool);
        msDeployer       = MultisigControllerDeployer(_multisigDeployer);
        // Authorize coordinator to update the inverse agent index
        registryOperators[_coordinator] = true;
        emit RegistryOperatorChanged(_coordinator, true);
    }

    /// @notice Grant or revoke permission to call deployVaultOnBehalf.
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        require(caller != address(0), "Registry: zero caller");
        authorizedCallers[caller] = authorized;
        emit CallerAuthorizationChanged(caller, authorized);
    }

    /// @notice Grant or revoke registry operator status.
    ///         Operators can call registerAgentForVault / registerSignerForVault etc.
    ///         The coordinator is pre-authorized in the constructor; deployed MultisigControllers
    ///         are authorized automatically in _installMultisig.
    function setRegistryOperator(address op, bool enabled) external onlyOwner {
        require(op != address(0), "Registry: zero operator");
        registryOperators[op] = enabled;
        emit RegistryOperatorChanged(op, enabled);
    }

    modifier onlyRegistryOperator() {
        require(registryOperators[msg.sender], "Registry: not a registry operator");
        _;
    }

    // ─── Inverse-index write hooks (called by AgentCoordinator and MultisigController) ──

    function registerAgentForVault(address vault, address agent) external onlyRegistryOperator {
        _agentVaults[agent].push(vault);
    }

    function unregisterAgentForVault(address vault, address agent) external onlyRegistryOperator {
        _removeFromArray(_agentVaults[agent], vault);
    }

    function registerSignerForVault(address vault, address signer) external onlyRegistryOperator {
        _signerVaults[signer].push(vault);
    }

    function unregisterSignerForVault(address vault, address signer) external onlyRegistryOperator {
        _removeFromArray(_signerVaults[signer], vault);
    }

    function _removeFromArray(address[] storage arr, address val) private {
        uint256 len = arr.length;
        for (uint256 i = 0; i < len; i++) {
            if (arr[i] == val) {
                arr[i] = arr[len - 1];
                arr.pop();
                return;
            }
        }
    }

    // ─── Inverse-index view queries ───────────────────────────────────────────

    /// @notice Returns all vault records where `agent` has been registered as an agent.
    function getVaultsForAgent(address agent) external view returns (VaultRecord[] memory) {
        return _resolveVaultRecords(_agentVaults[agent]);
    }

    /// @notice Returns all vault records where `signer` is a multisig signer.
    function getVaultsForSigner(address signer) external view returns (VaultRecord[] memory) {
        return _resolveVaultRecords(_signerVaults[signer]);
    }

    function _resolveVaultRecords(address[] storage addrs)
        private view returns (VaultRecord[] memory result)
    {
        uint256 len = addrs.length;
        result = new VaultRecord[](len);
        for (uint256 i = 0; i < len; i++) {
            address safe = addrs[i];
            address owner = safeToOwner[safe];
            VaultRecord[] storage records = _ownerVaults[owner];
            for (uint256 j = 0; j < records.length; j++) {
                if (records[j].safe == safe) {
                    result[i] = records[j];
                    break;
                }
            }
        }
    }

    struct VaultRecord {
        address safe;
        address keyManager;
        address policyEngine;
        address budgetPolicy;
        address multisigController;    // address(0) if not deployed
        address merchantPolicy;        // address(0) if not deployed
        address recipientBudgetPolicy; // address(0) if not deployed
        address expirationPolicy;      // address(0) if not deployed
        address agentBudgetPolicy;     // address(0) if not deployed
        string  label;
    }

    /// @dev owner → list of vault records they have deployed
    mapping(address => VaultRecord[]) private _ownerVaults;

    /// @dev Reverse lookups for dApps and scripts
    mapping(address => address) public safeToKeyManager;
    mapping(address => address) public safeToPolicyEngine;
    mapping(address => address) public safeToBudgetPolicy;
    mapping(address => address) public safeToMultisigController;
    mapping(address => address) public safeToMerchantPolicy;
    mapping(address => address) public safeToRecipientBudgetPolicy;
    mapping(address => address) public safeToExpirationPolicy;
    mapping(address => address) public safeToAgentBudgetPolicy;
    mapping(address => address) public safeToOwner;

    /// @dev ERC725Y key for the deployed MultisigController address.
    bytes32 private constant AVP_MULTISIG = keccak256("AVP:MultisigController");

    // ─── Agent-deployed vault metadata ───────────────────────────────────────────────

    /// @notice Every vault deployed through deployForAgent() maps to the human who
    ///         anchored the trust chain. The vault always belongs to this human —
    ///         the deploying agent is a builder, not an owner.
    mapping(address => address) public vaultRootOwner;

    /// @notice The agent that deployed each agent-created vault.
    ///         address(0) for human-deployed vaults (isAgentDeployed returns false).
    mapping(address => address) public vaultOperator;

    /// @notice Resolves any agent address back to the human at the root of its trust chain.
    ///         Humans are their own root (set in deployVault). Agents inherit the root
    ///         of their deployer (set in deployForAgent).
    mapping(address => address) public agentRootOwner;

    /// @dev agent → list of vault addresses that agent has deployed via deployForAgent().
    mapping(address => address[]) private _agentDeployedVaults;

    /// @notice Emitted on every vault deployment.
    event VaultDeployed(
        address indexed owner,
        address indexed safe,
        address indexed keyManager,
        address policyEngine,
        address budgetPolicy,
        address multisigController,
        string  label,
        uint256 chainId
    );

    event MultisigEnabled(
        address indexed owner,
        address indexed safe,
        address indexed multisig,
        uint256 signerCount,
        uint256 threshold,
        uint256 timeLock
    );

    /// @notice Emitted when an agent with CAN_DEPLOY atomically deploys a child vault.
    ///         The deploying agent is never the owner — rootOwner always holds that role.
    event AgentVaultDeployed(
        address indexed deployingOperator,
        address indexed rootOwner,
        address indexed newVault,
        address assignedAgent,
        uint256 budgetLimit,
        uint256 gasUsed,
        uint256 timestamp
    );

    /// @notice Emitted for each agent after permissions are written to ERC725Y storage.
    event AgentPermissionsConfigured(
        address indexed vault,
        address indexed agent,
        uint8 mode,
        bytes32 permissions,
        bytes32 allowedCallsHash
    );

    /// @notice Per-agent AllowedCalls input: maps agent address to raw LSP6 AllowedCalls bytes.
    /// @dev Only written to ERC725Y storage when agent does not hold SUPER_CALL.
    struct AllowedCallsInput {
        address agent;
        bytes allowedCalls;
    }

    /// @notice Per-recipient budget configuration for RecipientBudgetPolicy.
    ///         budget == 0 means whitelist-only (no individual cap); > 0 enforces a per-period cap.
    struct RecipientConfig {
        address recipient;
        uint256 budget;           // 0 = whitelist only; > 0 = active cap
        BudgetPolicy.Period period; // ignored when budget == 0
    }

    struct DeployParams {
        uint256 budget;
        BudgetPolicy.Period period;
        /// @dev address(0) for LYX budget; LSP7 contract address for token budget
        address budgetToken;
        /// @dev Unix timestamp for expiration; 0 = no expiry
        uint256 expiration;
        /// @dev Agent addresses to grant permissions (max 20)
        address[] agents;
        /// @dev Individual budgets for each agent (optional; must match agents.length if provided)
        uint256[] agentBudgets;
        /// @dev Initial merchant whitelist (max 100 per batch; triggers MerchantPolicy deployment)
        address[] merchants;
        /// @dev Per-recipient budget configs (triggers RecipientBudgetPolicy deployment when non-empty)
        RecipientConfig[] recipientConfigs;
        string label;
        // ─── Permission profile fields ──────────────────────────────────────
        /// @dev 0=STRICT_PAYMENTS, 1=SUBSCRIPTIONS, 2=TREASURY_BALANCED, 3=OPS_ADMIN, 4=CUSTOM
        uint8 agentMode;
        /// @dev Required to be true when agentMode=CUSTOM with SUPER_* bits, or any mode containing SUPER_*.
        bool allowSuperPermissions;
        /// @dev Used only when agentMode=4 (CUSTOM). Caller-provided bitmask.
        bytes32 customAgentPermissions;
        /// @dev Per-agent AllowedCalls entries. Required when resolved permissions include CALL (0x800)
        ///      and do NOT include any SUPER_* bits. Must be non-empty for each agent.
        AllowedCallsInput[] allowedCallsByAgent;
        // ─── Multisig fields ────────────────────────────────────────────────
        /// @dev Set of addresses allowed to approve vault proposals. Empty = no multisig deployed.
        address[] multisigSigners;
        /// @dev Required number of approvals for a proposal to execute.
        uint256   multisigThreshold;
        /// @dev Minimum seconds between approval and execution (0 = no delay).
        uint256   multisigTimeLock;
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /// @dev Writes a key/value into an AgentSafe's ERC725Y storage, then immediately
    ///      reads it back to verify the write succeeded. Emits DiagnosticWrite with
    ///      the keccak256 hashes of the intended and observed values for forensics.
    ///      Reverts if the observed value does not match the intended value.
    function _setDataVerified(IAgentSafe safe, bytes32 key, bytes memory value) private {
        safe.setData(key, value);
        bytes memory observed = safe.getData(key);
        bytes32 intendedHash = keccak256(value);
        bytes32 observedHash = keccak256(observed);
        emit DiagnosticWrite(key, address(safe), intendedHash, observedHash);
        require(intendedHash == observedHash, "Registry: write verification failed");
    }

    function _appendToAddressPermissionsArray(
        IAgentSafe safe,
        address controller,
        uint128 index
    ) private {
        bytes32 elementKey = bytes32(abi.encodePacked(AP_ARRAY_KEY_PREFIX, bytes16(index)));
        _setDataVerified(safe, elementKey, abi.encodePacked(bytes20(controller)));
        _setDataVerified(safe, AP_ARRAY_KEY, abi.encodePacked(uint128(index + 1)));
    }

    function _readAddressPermissionsLength(IAgentSafe safe) private view returns (uint128 len) {
        bytes memory raw = safe.getData(AP_ARRAY_KEY);
        require(raw.length == 16, "Registry: invalid AP array length");
        assembly {
            len := shr(128, mload(add(raw, 32)))
        }
    }

    function _findOwnerVaultRecordIndex(address owner, address safe) private view returns (uint256 recordIdx) {
        VaultRecord[] storage records = _ownerVaults[owner];
        uint256 len = records.length;
        recordIdx = type(uint256).max;
        for (uint256 i = 0; i < len; i++) {
            if (records[i].safe == safe) {
                recordIdx = i;
                break;
            }
        }
    }

    function _installMultisig(
        IAgentSafe safe,
        address km,
        address[] memory signers,
        uint256 threshold,
        uint256 timeLock,
        uint128 apIdx
    ) private returns (address multisig, uint128 nextApIdx) {
        multisig = msDeployer.newMultisigController(
            address(safe), km, signers, threshold, timeLock, address(this)
        );
        _setDataVerified(safe, AVP_MULTISIG, abi.encode(multisig));
        _setDataVerified(
            safe,
            LSP6KeyLib.apPermissionsKey(multisig),
            abi.encodePacked(LSP6KeyLib.PERM_POWER_USER)
        );
        _appendToAddressPermissionsArray(safe, multisig, apIdx);

        // Authorize this MultisigController to call register/unregisterSignerForVault
        // so addSigner/removeSigner can update the inverse index autonomously.
        registryOperators[multisig] = true;
        emit RegistryOperatorChanged(multisig, true);

        // Populate inverse signer index for all initial signers
        for (uint256 i = 0; i < signers.length; i++) {
            _signerVaults[signers[i]].push(address(safe));
        }

        nextApIdx = apIdx + 1;
    }

    function _registerVaultRecord(
        address owner,
        address safe,
        address km,
        address policyEngine,
        address budgetPolicy,
        address multisig,
        address merchantPolicy,
        address recipientBudgetPolicy,
        address expirationPolicy,
        address agentBudgetPolicy,
        string memory label
    ) private returns (VaultRecord memory record) {
        record = VaultRecord(
            safe,
            km,
            policyEngine,
            budgetPolicy,
            multisig,
            merchantPolicy,
            recipientBudgetPolicy,
            expirationPolicy,
            agentBudgetPolicy,
            label
        );
        _ownerVaults[owner].push(record);
        safeToKeyManager[safe]            = km;
        safeToPolicyEngine[safe]          = policyEngine;
        safeToBudgetPolicy[safe]          = budgetPolicy;
        safeToMultisigController[safe]    = multisig;
        safeToMerchantPolicy[safe]        = merchantPolicy;
        safeToRecipientBudgetPolicy[safe] = recipientBudgetPolicy;
        safeToExpirationPolicy[safe]      = expirationPolicy;
        safeToAgentBudgetPolicy[safe]     = agentBudgetPolicy;
        safeToOwner[safe]                 = owner;

        emit VaultDeployed(owner, safe, km, policyEngine, budgetPolicy, multisig, label, block.chainid);
    }

    // ─── Deployment ───────────────────────────────────────────────────────────

    /// @dev Validates shared pre-conditions and returns the resolved agent permissions bitmask.
    function _validateAndResolve(DeployParams calldata p) private pure returns (bytes32 agentPerms) {
        require(p.agents.length <= 20, "Registry: too many agents");
        require(
            p.agentBudgets.length == 0 || p.agentBudgets.length == p.agents.length,
            "Registry: agentBudgets length mismatch"
        );
        require(
            p.allowedCallsByAgent.length == 0 || p.allowedCallsByAgent.length == p.agents.length,
            "Registry: allowedCallsByAgent length mismatch"
        );
        require(
            p.recipientConfigs.length <= 100,
            "Registry: too many recipient configs"
        );

        // Resolve permissions bitmask from mode
        agentPerms = _resolveAgentPerms(p);

        // Guardrail: SUPER_* bits require explicit opt-in
        if (!p.allowSuperPermissions) {
            require(
                !LSP6KeyLib.hasSuperBits(agentPerms),
                "Registry: super permissions disabled"
            );
        }

        // Enforce AllowedCalls when CALL bit is set without SUPER_CALL
        if (LSP6KeyLib.hasCall(agentPerms) && !LSP6KeyLib.hasSuperBits(agentPerms)) {
            require(
                p.allowedCallsByAgent.length == p.agents.length,
                "Registry: AllowedCalls required for CALL permission"
            );
        }
    }

    /// @dev Resolves the agent permissions bitmask from the DeployParams mode field.
    function _resolveAgentPerms(DeployParams calldata p) private pure returns (bytes32) {
        if (p.agentMode == uint8(LSP6KeyLib.AgentMode.STRICT_PAYMENTS))   return LSP6KeyLib.PERM_STRICT;
        if (p.agentMode == uint8(LSP6KeyLib.AgentMode.SUBSCRIPTIONS))      return LSP6KeyLib.PERM_SUBSCRIPTIONS;
        if (p.agentMode == uint8(LSP6KeyLib.AgentMode.TREASURY_BALANCED))  return LSP6KeyLib.PERM_TREASURY;
        if (p.agentMode == uint8(LSP6KeyLib.AgentMode.OPS_ADMIN))          return LSP6KeyLib.PERM_OPS;
        // CUSTOM (4): use caller-provided bitmask
        return p.customAgentPermissions;
    }

    function deployVault(DeployParams calldata p) external returns (VaultRecord memory record) {
        _validateAndResolve(p); // validates, reverts on error
        if (p.merchants.length > 0) require(p.merchants.length <= 100, "Registry: too many merchants");
        // The human who calls deployVault() is the root of their own trust chain:
        // any agents they later authorize with CAN_DEPLOY will inherit this root.
        agentRootOwner[msg.sender] = msg.sender;
        record = _deployStack(msg.sender, p);
    }

    function deployVaultOnBehalf(address owner, DeployParams calldata p)
        external
        returns (VaultRecord memory record)
    {
        require(authorizedCallers[msg.sender], "Registry: caller not authorized");
        require(owner != address(0), "Registry: zero owner");
        _validateAndResolve(p);
        if (p.merchants.length > 0) require(p.merchants.length <= 100, "Registry: too many merchants");
        record = _deployStack(owner, p);
    }

    /// @notice Allows an agent with CAN_DEPLOY to atomically:
    ///         1. Deploy a new child vault owned by the human root of the deploying agent
    ///         2. Carve a budget from the deploying agent's own remaining pool
    ///         3. Register an operator agent for the child vault
    ///
    ///         The human who originally anchored the trust chain remains the vault owner.
    ///         The deploying agent is an operator \u2014 a builder, never an owner.
    ///
    /// @param vaultLabel        ERC725Y label for the new vault
    /// @param budgetLimit       Max budget to allocate from the deploying agent's pool.
    ///                          An agent cannot allocate what has not been granted to it.
    /// @param resetPeriod       Budget reset period for the child pool (0=DAILY,1=WEEKLY,2=MONTHLY)
    /// @param assignedAgent     Address of the agent to operate the new vault
    /// @param agentMaxGas       Max gas per call for the assigned agent (0 for EOA)
    /// @param agentAllowAutomation  Whether the assigned agent can be used in TaskScheduler
    /// @param agentCapabilities Capabilities to grant the assigned agent. Must be a subset
    ///                          of the deploying agent's own capabilities.
    function deployForAgent(
        bytes32 vaultLabel,
        uint256 budgetLimit,
        uint8   resetPeriod,
        address assignedAgent,
        uint256 agentMaxGas,
        bool    agentAllowAutomation,
        bytes32[] calldata agentCapabilities
    ) external returns (address newVault, address newKeyManager) {
        uint256 gasStart = gasleft();

        // Guard: the entire multi-contract orchestration requires more gas than a plain deployment.
        if (gasStart < MIN_GAS_FOR_DEPLOY_FOR_AGENT) {
            revert InsufficientGasForDeployment(gasStart, MIN_GAS_FOR_DEPLOY_FOR_AGENT);
        }

        // Step 1 \u2014 Validate caller capability.
        //   An agent cannot grant the power to deploy unless it was explicitly given that power
        //   by a human or by an agent that itself holds CAN_DEPLOY.
        require(
            coordinator.hasCapability(msg.sender, coordinator.CAN_DEPLOY()),
            "Registry: caller lacks CAN_DEPLOY"
        );

        // Step 1b \u2014 Validate delegation depth.
        //   The chain from human to this agent has a finite depth. Enforcing a ceiling prevents
        //   infinite recursive delegation and keeps the trust graph auditable.
        require(
            coordinator.getDelegationDepth(msg.sender) < coordinator.MAX_DELEGATION_DEPTH(),
            "Registry: delegation depth limit reached"
        );

        // Step 1c \u2014 Assigned agent must not already exist.
        require(
            !coordinator.isAgentRegistered(assignedAgent),
            "Registry: assignedAgent already registered"
        );

        // Step 2 \u2014 Validate budget BEFORE any state is written.
        //   An agent cannot allocate what has not been granted to it \u2014 this is the constraint
        //   that makes autonomous deployment safe. Checking before deployment ensures no
        //   partial state is written when the budget check fails.
        bytes32 deployerPoolId = pool.getVaultPool(msg.sender);
        require(deployerPoolId != bytes32(0), "Registry: deploying agent has no budget pool");
        require(
            budgetLimit <= pool.getPoolRemaining(deployerPoolId),
            "Registry: budgetLimit exceeds deployer remaining pool"
        );

        // Step 3 \u2014 Resolve the root human owner.
        //   The vault always belongs to the human who anchored the trust chain.
        //   If this mapping is zero the deploying agent was never rooted to a human \u2014 abort.
        address rootOwner = agentRootOwner[msg.sender];
        require(rootOwner != address(0), "Registry: deploying agent has no resolvable root owner");

        // Step 4 \u2014 Validate capability subset.
        //   An agent cannot grant its sub-agents more than it was itself given.
        //   CAN_DEPLOY can only be included if the deploying agent holds it AND depth allows.
        for (uint256 i = 0; i < agentCapabilities.length; i++) {
            if (agentCapabilities[i] == coordinator.CAN_DEPLOY()) {
                // CAN_DEPLOY propagation is only allowed if depth would still permit further deployment.
                require(
                    coordinator.getDelegationDepth(msg.sender) + 1 < coordinator.MAX_DELEGATION_DEPTH(),
                    "Registry: cannot propagate CAN_DEPLOY at max depth"
                );
            }
        }
        require(
            coordinator.isSubset(msg.sender, agentCapabilities),
            "Registry: agentCapabilities not a subset of deployer capabilities"
        );

        // Step 5 \u2014 Deploy vault with rootOwner as the owner, never msg.sender.
        //   The vault always belongs to the human who anchored the trust chain.
        //   _deployVaultSimple constructs a lean vault stack (AgentSafe + PolicyEngine +
        //   BudgetPolicy + KeyManager) without the optional policy decorators.
        (newVault, newKeyManager) = _deployVaultSimple(rootOwner, vaultLabel, budgetLimit, resetPeriod);

        // Step 6 \u2014 Register vault metadata.
        vaultRootOwner[newVault]                    = rootOwner;
        vaultOperator[newVault]                     = msg.sender;
        _agentDeployedVaults[msg.sender].push(newVault);
        // Inverse agent index — populated here because assignedAgent isn't known until Step 8
        // (we pre-register to keep the index consistent with the assignment below)
        _agentVaults[assignedAgent].push(newVault);

        // Step 7 \u2014 Create child budget pool carved from deployer's pool.
        //   The deploying agent cannot allocate more than it has remaining \u2014 enforced above.
        //   The pool hierarchy ensures spend in the child also charges the parent chain.
        {
            bytes32 childPoolId = keccak256(abi.encode(newVault, block.timestamp));
            address[] memory vaultArr = new address[](1);
            vaultArr[0] = newVault;
            bytes32[] memory emptyChildPools = new bytes32[](0);
            pool.createPool(
                childPoolId,
                deployerPoolId,
                budgetLimit,
                ISharedBudgetPool.Period(resetPeriod),
                vaultArr,
                emptyChildPools
            );
        }

        // Step 8 \u2014 Register assigned agent and propagate trust chain metadata.
        //   Steps 8a\u20138c must all succeed or the entire transaction reverts \u2014 no partial registration.
        coordinator.registerAgent(assignedAgent, agentMaxGas, agentAllowAutomation);
        coordinator.assignRole(assignedAgent, keccak256("DEPLOYED_AGENT"), agentCapabilities);
        coordinator.setDelegationDepth(
            assignedAgent,
            coordinator.getDelegationDepth(msg.sender) + 1
        );
        // Propagate the root human to the newly registered agent so it can be resolved
        // transitively if this agent is later granted CAN_DEPLOY.
        agentRootOwner[assignedAgent] = rootOwner;

        emit AgentVaultDeployed(
            msg.sender,
            rootOwner,
            newVault,
            assignedAgent,
            budgetLimit,
            gasStart - gasleft(),
            block.timestamp
        );
    }

    /// @dev Deploys a lean vault stack (Safe + PolicyEngine + BudgetPolicy + KeyManager)
    ///      with rootOwner as the owner. Used exclusively by deployForAgent(). The simpler
    ///      parameter set avoids constructing a full DeployParams in memory.
    function _deployVaultSimple(
        address rootOwner,
        bytes32 label,
        uint256 budget,
        uint8   period
    ) private returns (address safeAddr, address km) {
        if (gasleft() < MINIMUM_DEPLOYMENT_GAS) {
            revert InsufficientGasForDeployment(gasleft(), MINIMUM_DEPLOYMENT_GAS);
        }

        // 1. Deploy AgentSafe \u2014 factory is temp owner
        IAgentSafe safe = IAgentSafe(core.newSafe(address(this)));

        // 2. Deploy PolicyEngine linked to safe
        IPolicyEngine pe = IPolicyEngine(core.newPolicyEngine(address(this), address(safe)));

        // 3. Deploy BudgetPolicy (vault-level budget; period maps 0\u21921 day, 1\u21927 days, 2\u219230 days)
        BudgetPolicy.Period bPeriod = BudgetPolicy.Period(period);
        IBudgetPolicy budgetPolicy = IBudgetPolicy(
            deployer.newBudgetPolicy(address(this), address(pe), budget, bPeriod, address(0))
        );
        pe.addPolicy(address(budgetPolicy));

        // 4. Link PolicyEngine to Safe
        safe.setPolicyEngine(address(pe));

        // 5. Deploy LSP6 KeyManager
        km = kmDeployer.newKeyManager(address(safe));
        safe.setKeyManager(km);

        // 6. Write rootOwner SUPER_* permissions into ERC725Y storage
        bytes32 superPerm = bytes32(type(uint256).max);
        _setDataVerified(safe, LSP6KeyLib.apPermissionsKey(rootOwner), abi.encodePacked(superPerm));
        _appendToAddressPermissionsArray(safe, rootOwner, 0);

        // 7. Transfer ownership to rootOwner.
        //    AgentSafe, PolicyEngine, and BudgetPolicy all use LSP14 two-step ownership,
        //    so rootOwner must call acceptOwnership() on each contract.
        safe.transferOwnership(rootOwner);
        pe.transferOwnership(rootOwner);
        budgetPolicy.transferOwnership(rootOwner);

        // 8. Write LSP3 profile for LUKSO ecosystem discoverability
        string memory labelStr = string(abi.encodePacked(label));
        bytes memory profileJson = abi.encodePacked(
            'data:application/json,{"LSP3Profile":{"name":"',
            labelStr,
            '","description":"Vaultia Vault"}}'
        );
        _setDataVerified(safe, LSP3_PROFILE_KEY, profileJson);

        // 9. Register vault in indexing structures
        _registerVaultRecord(
            rootOwner,
            address(safe),
            km,
            address(pe),
            address(budgetPolicy),
            address(0),
            address(0),
            address(0),
            address(0),
            address(0),
            labelStr
        );

        safeAddr = address(safe);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    /// @notice Returns the human root owner for any vault deployed via deployForAgent().
    ///         Returns address(0) for human-deployed vaults (use VaultDeployed owner field instead).
    function getRootOwner(address vault) external view returns (address) {
        return vaultRootOwner[vault];
    }

    /// @notice Returns all vaults deployed by a specific agent operator.
    function getVaultsDeployedBy(address agent) external view returns (address[] memory) {
        return _agentDeployedVaults[agent];
    }

    /// @notice Returns true if this vault was deployed by an agent via deployForAgent().
    ///         False for vaults deployed directly by humans via deployVault().
    function isAgentDeployed(address vault) external view returns (bool) {
        return vaultOperator[vault] != address(0);
    }

    function _configureAgentPermissions(
        IAgentSafe safe,
        DeployParams calldata p,
        uint128 apIdx
    ) private returns (uint128) {
        bytes32 agentPerms = _resolveAgentPerms(p);
        bool isSuperMode = LSP6KeyLib.hasSuperBits(agentPerms);
        bool needsAllowedCalls = LSP6KeyLib.hasCall(agentPerms) && !isSuperMode;

        for (uint256 i = 0; i < p.agents.length; i++) {
            address agentAddr = p.agents[i];

            // Write permissions bitmap
            _setDataVerified(
                safe,
                LSP6KeyLib.apPermissionsKey(agentAddr),
                abi.encodePacked(agentPerms)
            );
            _appendToAddressPermissionsArray(safe, agentAddr, apIdx++);

            // Write AllowedCalls when required (CALL without SUPER)
            if (needsAllowedCalls) {
                bytes memory allowedCalls = p.allowedCallsByAgent[i].allowedCalls;
                _setDataVerified(
                    safe,
                    LSP6KeyLib.apAllowedCallsKey(agentAddr),
                    allowedCalls
                );
                emit AgentPermissionsConfigured(
                    address(safe),
                    agentAddr,
                    p.agentMode,
                    agentPerms,
                    keccak256(allowedCalls)
                );
            } else {
                emit AgentPermissionsConfigured(
                    address(safe),
                    agentAddr,
                    p.agentMode,
                    agentPerms,
                    bytes32(0)
                );
            }
        }

        return apIdx;
    }

    function _deployStack(address owner, DeployParams calldata p)
        private
        returns (VaultRecord memory record)
    {
        if (gasleft() < MINIMUM_DEPLOYMENT_GAS) {
            revert InsufficientGasForDeployment(gasleft(), MINIMUM_DEPLOYMENT_GAS);
        }

        // 1. Deploy AgentSafe — factory is temp owner
        IAgentSafe safe = IAgentSafe(core.newSafe(address(this)));

        // 2. Deploy PolicyEngine linked to safe
        IPolicyEngine pe = IPolicyEngine(core.newPolicyEngine(address(this), address(safe)));

        // 3. Deploy BudgetPolicy (vault-level budget)
        IBudgetPolicy budgetPolicy = IBudgetPolicy(
            deployer.newBudgetPolicy(address(this), address(pe), p.budget, p.period, p.budgetToken)
        );
        pe.addPolicy(address(budgetPolicy));

        // 4. Optionally deploy MerchantPolicy
        address merchantAddr = address(0);
        if (p.merchants.length > 0) {
            require(p.merchants.length <= 100, "Registry: too many merchants");
            IMerchantPolicy mp = IMerchantPolicy(optionalDeployer.newMerchantPolicy(address(this), address(pe)));
            merchantAddr = address(mp);
            mp.addMerchants(p.merchants);
            pe.addPolicy(merchantAddr);
            mp.transferOwnership(owner);
        }

        // 4.5. Optionally deploy RecipientBudgetPolicy (per-recipient limits + whitelist)
        address recipientBudgetAddr = address(0);
        if (p.recipientConfigs.length > 0) {
            IRecipientBudgetPolicy rbp = IRecipientBudgetPolicy(
                optionalDeployer.newRecipientBudgetPolicy(address(this), address(pe), p.budgetToken)
            );
            recipientBudgetAddr = address(rbp);
            for (uint256 i = 0; i < p.recipientConfigs.length; i++) {
                rbp.setRecipientLimit(
                    p.recipientConfigs[i].recipient,
                    p.recipientConfigs[i].budget,
                    p.recipientConfigs[i].period
                );
            }
            pe.addPolicy(recipientBudgetAddr);
            rbp.transferOwnership(owner);
        }

        // 5. Optionally deploy ExpirationPolicy
        address expirationAddr = address(0);
        if (p.expiration > 0) {
            require(p.expiration > block.timestamp, "Registry: expiration in the past");
            IExpirationPolicy ep = IExpirationPolicy(
                optionalDeployer.newExpirationPolicy(address(this), address(pe), p.expiration)
            );
            expirationAddr = address(ep);
            pe.addPolicy(expirationAddr);
            ep.transferOwnership(owner);
        }

        // 6. Optionally deploy AgentBudgetPolicy (agent-level budgets)
        address agentBudgetAddr = address(0);
        if (p.agentBudgets.length > 0) {
            IAgentBudgetPolicy agentBudgetPolicy = IAgentBudgetPolicy(
                optionalDeployer.newAgentBudgetPolicy(address(this), address(pe), p.period, p.budgetToken)
            );
            agentBudgetAddr = address(agentBudgetPolicy);
            for (uint256 i = 0; i < p.agents.length; i++) {
                agentBudgetPolicy.setAgentBudget(p.agents[i], p.agentBudgets[i]);
            }
            agentBudgetPolicy.syncPeriodStart(budgetPolicy.periodStart());
            pe.addPolicy(agentBudgetAddr);
            agentBudgetPolicy.transferOwnership(owner);
        }

        // 7. Link PolicyEngine to Safe
        safe.setPolicyEngine(address(pe));

        // 8. Deploy LSP6 KeyManager targeting this safe
        address km = kmDeployer.newKeyManager(address(safe));

        // 9. Link KM to Safe
        safe.setKeyManager(km);

        // 10. Write owner SUPER_* permissions into safe's ERC725Y storage (with read-back verification)
        bytes32 superPerm = bytes32(type(uint256).max);
        _setDataVerified(
            safe,
            LSP6KeyLib.apPermissionsKey(owner),
            abi.encodePacked(superPerm)
        );
        uint128 apIdx = 0;
        _appendToAddressPermissionsArray(safe, owner, apIdx++);

        // 11. Write permissions + AllowedCalls for each agent based on agentMode.
        //     SUPER_* bits bypass AllowedCalls enforcement in LSP6. Non-SUPER modes write
        //     per-agent AllowedCalls to add a second enforcement layer on top of PolicyEngine.
        apIdx = _configureAgentPermissions(safe, p, apIdx);

        // Populate inverse agent index so agents can discover this vault without knowing its address.
        for (uint256 i = 0; i < p.agents.length; i++) {
            _agentVaults[p.agents[i]].push(address(safe));
        }

        // 11.5. Optionally deploy MultisigController (must happen after KM is deployed
        //       and before transferOwnership — registry is still temp owner of the safe).
        //       The controller is granted SUPER_CALL | SUPER_TRANSFERVALUE (PERM_POWER_USER
        //       = 0x500) so it can forward approved proposals through the LSP6 KeyManager
        //       to any target address. Using SUPER_* bits is required because LUKSO LSP6
        //       reverts with NoCallsAllowed when AllowedCalls is empty but CALL is set
        //       without SUPER_CALL. The M-of-N approval flow + PolicyEngine enforce the
        //       actual spend restrictions instead of LSP6 AllowedCalls.
        address msAddr = address(0);
        if (p.multisigSigners.length > 0) {
            (msAddr, apIdx) = _installMultisig(
                safe,
                km,
                p.multisigSigners,
                p.multisigThreshold,
                p.multisigTimeLock,
                apIdx
            );
        }

        // 12. Transfer ownership to user.
        //     AgentSafe, PolicyEngine, BudgetPolicy, and any optional policies all use
        //     LSP14 two-step ownership, so the user must call acceptOwnership() on each.
        safe.transferOwnership(owner);
        pe.transferOwnership(owner);
        budgetPolicy.transferOwnership(owner);

        // 13. Write LSP3 profile so the vault appears with its name in the LUKSO ecosystem
        //     (UP explorer, universaleverything.io, etc.)
        bytes memory profileJson = abi.encodePacked(
            'data:application/json,{"LSP3Profile":{"name":"',
            p.label,
            '","description":"Vaultia Vault"}}'
        );
        _setDataVerified(safe, LSP3_PROFILE_KEY, profileJson);

        // 14. Register vault
        record = _registerVaultRecord(
            owner,
            address(safe),
            km,
            address(pe),
            address(budgetPolicy),
            msAddr,
            merchantAddr,
            recipientBudgetAddr,
            expirationAddr,
            agentBudgetAddr,
            p.label
        );
    }

    function getVaults(address owner) external view returns (VaultRecord[] memory) {
        return _ownerVaults[owner];
    }

    function getKeyManager(address safe) external view returns (address) {
        return safeToKeyManager[safe];
    }

    function getPolicyEngine(address safe) external view returns (address) {
        return safeToPolicyEngine[safe];
    }

    /// @notice Register a MultisigController that was deployed outside the registry
    ///         (e.g. post-deploy, or via a custom deployer).
    ///         Only the vault owner can register. Updates both the reverse-lookup
    ///         mapping and the VaultRecord so widgets always see a consistent state.
    function registerMultisigController(address safe, address multisig) external {
        require(safeToOwner[safe] == msg.sender, "Registry: not vault owner");
        require(multisig != address(0), "Registry: zero multisig");
        safeToMultisigController[safe] = multisig;
        VaultRecord[] storage records = _ownerVaults[msg.sender];
        for (uint256 i = 0; i < records.length; i++) {
            if (records[i].safe == safe) {
                records[i].multisigController = multisig;
                break;
            }
        }
    }

    /// @notice Enables multisig protection on a vault that was already deployed without it,
    ///         before the designated owner has accepted ownership. This is intended for
    ///         widget-safe staged activation flows where deploy and multisig installation
    ///         are split into separate transactions.
    function enableMultisig(
        address safeAddr,
        address[] calldata signers,
        uint256 threshold,
        uint256 timeLock
    ) external returns (address multisig) {
        require(safeAddr != address(0), "Registry: zero safe");

        address designatedOwner = safeToOwner[safeAddr];
        require(designatedOwner != address(0), "Registry: unknown safe");
        require(designatedOwner == msg.sender, "Registry: not designated owner");
        require(safeToMultisigController[safeAddr] == address(0), "Registry: multisig already set");
        require(IOwned(safeAddr).owner() == address(this), "Registry: safe already accepted");
        require(IPendingOwnable(safeAddr).pendingOwner() == msg.sender, "Registry: safe not pending to caller");

        uint256 recordIdx = _findOwnerVaultRecordIndex(msg.sender, safeAddr);
        require(recordIdx != type(uint256).max, "Registry: safe not in owner records");

        address km = safeToKeyManager[safeAddr];
        require(km != address(0), "Registry: missing key manager");

        IAgentSafe safe = IAgentSafe(safeAddr);
        uint128 apIdx = _readAddressPermissionsLength(safe);

        (multisig, ) = _installMultisig(safe, km, signers, threshold, timeLock, apIdx);

        safeToMultisigController[safeAddr] = multisig;
        _ownerVaults[msg.sender][recordIdx].multisigController = multisig;

        emit MultisigEnabled(msg.sender, safeAddr, multisig, signers.length, threshold, timeLock);
    }

    /// @notice Returns every contract in the vault stack that still has a pending
    ///         LSP14 ownership transfer, paired with a flag indicating whether
    ///         msg.sender is the pending owner.
    ///         Widgets call this to drive the acceptOwnership() UX without needing
    ///         to know the full contract list.
    ///
    /// @param safe  The AgentSafe address to inspect.
    /// @return contracts  Non-zero addresses from the vault stack (KeyManager excluded
    ///                    — it is a delegate, not an owner).
    /// @return pending    True when msg.sender is pendingOwner() for the corresponding
    ///                    address in `contracts`.
    function getPendingContracts(address safe)
        external
        view
        returns (address[] memory contracts, bool[] memory pending)
    {
        address owner = safeToOwner[safe];
        require(owner != address(0), "Registry: unknown safe");

        VaultRecord[] storage records = _ownerVaults[owner];
        uint256 recordIdx = _findOwnerVaultRecordIndex(owner, safe);
        require(recordIdx != type(uint256).max, "Registry: safe not in owner records");
        VaultRecord storage r = records[recordIdx];

        // Build candidate list (skip keyManager — it uses a delegate model, not LSP14;
        // skip multisigController — it uses ReentrancyGuard, not LSP14/Ownable).
        address[7] memory candidates = [
            r.safe,
            r.policyEngine,
            r.budgetPolicy,
            r.merchantPolicy,
            r.recipientBudgetPolicy,
            r.expirationPolicy,
            r.agentBudgetPolicy
        ];

        uint256 count;
        for (uint256 i = 0; i < 7; i++) {
            if (candidates[i] != address(0)) count++;
        }

        contracts = new address[](count);
        pending   = new bool[](count);
        uint256 idx;
        for (uint256 i = 0; i < 7; i++) {
            if (candidates[i] == address(0)) continue;
            contracts[idx] = candidates[i];
            try IPendingOwnable(candidates[i]).pendingOwner() returns (address po) {
                pending[idx] = (po == msg.sender);
            } catch {
                pending[idx] = false;
            }
            idx++;
        }
    }
}
