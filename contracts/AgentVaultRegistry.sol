// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AgentVaultDeployerCore} from "./AgentVaultDeployerCore.sol";
import {AgentVaultDeployer} from "./AgentVaultDeployer.sol";
import {AgentKMDeployer} from "./AgentKMDeployer.sol";
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
///         User must call acceptOwnership() on safe and pe in separate transactions
///         (LSP14 two-step transfer — dApp should prompt).
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

    error InsufficientGasForDeployment(uint256 available, uint256 required);

    AgentVaultDeployerCore public immutable core;
    AgentVaultDeployer     public immutable deployer;
    AgentKMDeployer        public immutable kmDeployer;

    /// @dev Addresses allowed to call deployVaultOnBehalf (e.g. TemplateFactory).
    ///      Only the registry owner can grant/revoke authorization.
    mapping(address => bool) public authorizedCallers;

    event CallerAuthorizationChanged(address indexed caller, bool authorized);

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

    constructor(address _core, address _deployer, address _km) Ownable() {
        require(_core     != address(0), "Registry: zero core");
        require(_deployer != address(0), "Registry: zero deployer");
        require(_km       != address(0), "Registry: zero km");
        core       = AgentVaultDeployerCore(_core);
        deployer   = AgentVaultDeployer(_deployer);
        kmDeployer = AgentKMDeployer(_km);
    }

    /// @notice Grant or revoke permission to call deployVaultOnBehalf.
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        require(caller != address(0), "Registry: zero caller");
        authorizedCallers[caller] = authorized;
        emit CallerAuthorizationChanged(caller, authorized);
    }

    struct VaultRecord {
        address safe;
        address keyManager;
        address policyEngine;
        string  label;
    }

    /// @dev owner → list of vault records they have deployed
    mapping(address => VaultRecord[]) private _ownerVaults;

    /// @dev Reverse lookups for dApps and scripts
    mapping(address => address) public safeToKeyManager;
    mapping(address => address) public safeToPolicyEngine;

    /// @notice Emitted on every vault deployment.
    event VaultDeployed(
        address indexed owner,
        address indexed safe,
        address indexed keyManager,
        address policyEngine,
        string  label,
        uint256 chainId
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
        if (p.merchants.length > 0) {
            require(p.merchants.length <= 100, "Registry: too many merchants");
            IMerchantPolicy mp = IMerchantPolicy(deployer.newMerchantPolicy(address(this), address(pe)));
            mp.addMerchants(p.merchants);
            pe.addPolicy(address(mp));
            mp.transferOwnership(owner);
        }

        // 4.5. Optionally deploy RecipientBudgetPolicy (per-recipient limits + whitelist)
        if (p.recipientConfigs.length > 0) {
            IRecipientBudgetPolicy rbp = IRecipientBudgetPolicy(
                deployer.newRecipientBudgetPolicy(address(this), address(pe), p.budgetToken)
            );
            for (uint256 i = 0; i < p.recipientConfigs.length; i++) {
                rbp.setRecipientLimit(
                    p.recipientConfigs[i].recipient,
                    p.recipientConfigs[i].budget,
                    p.recipientConfigs[i].period
                );
            }
            pe.addPolicy(address(rbp));
            rbp.transferOwnership(owner);
        }

        // 5. Optionally deploy ExpirationPolicy
        if (p.expiration > 0) {
            require(p.expiration > block.timestamp, "Registry: expiration in the past");
            IExpirationPolicy ep = IExpirationPolicy(
                deployer.newExpirationPolicy(address(this), address(pe), p.expiration)
            );
            pe.addPolicy(address(ep));
            ep.transferOwnership(owner);
        }

        // 6. Optionally deploy AgentBudgetPolicy (agent-level budgets)
        if (p.agentBudgets.length > 0) {
            IAgentBudgetPolicy agentBudgetPolicy = IAgentBudgetPolicy(
                deployer.newAgentBudgetPolicy(address(this), address(pe), p.period, p.budgetToken)
            );
            for (uint256 i = 0; i < p.agents.length; i++) {
                agentBudgetPolicy.setAgentBudget(p.agents[i], p.agentBudgets[i]);
            }
            agentBudgetPolicy.syncPeriodStart(budgetPolicy.periodStart());
            pe.addPolicy(address(agentBudgetPolicy));
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

        // 12. Transfer ownership to user (LSP14 two-step — user calls acceptOwnership() next)
        safe.transferOwnership(owner);
        pe.transferOwnership(owner);
        budgetPolicy.transferOwnership(owner);

        // 13. Register vault
        record = VaultRecord(address(safe), km, address(pe), p.label);
        _ownerVaults[owner].push(record);
        safeToKeyManager[address(safe)] = km;
        safeToPolicyEngine[address(safe)] = address(pe);

        emit VaultDeployed(owner, address(safe), km, address(pe), p.label, block.chainid);
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
}
