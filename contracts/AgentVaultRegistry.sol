// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AgentSafe} from "./AgentSafe.sol";
import {PolicyEngine} from "./PolicyEngine.sol";
import {BudgetPolicy} from "./policies/BudgetPolicy.sol";
import {MerchantPolicy} from "./policies/MerchantPolicy.sol";
import {ExpirationPolicy} from "./policies/ExpirationPolicy.sol";
import {AgentBudgetPolicy} from "./policies/AgentBudgetPolicy.sol";
import {LSP6KeyManager} from "@lukso/lsp6-contracts/contracts/LSP6KeyManager.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

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
///         FIX #26: simple mapping(address => VaultRecord[]) — one per chain deployment.
///                  Cross-chain indexing via chainId field in VaultDeployed event.
contract AgentVaultRegistry is Ownable {

    /// @dev Addresses allowed to call deployVaultOnBehalf (e.g. TemplateFactory).
    ///      Only the registry owner can grant/revoke authorization.
    mapping(address => bool) public authorizedCallers;

    event CallerAuthorizationChanged(address indexed caller, bool authorized);

    /// @dev LSP2 MappingWithGrouping prefix for AddressPermissions:Permissions:<address>.
    ///      bytes10(keccak256("AddressPermissions:Permissions")) truncated to first 10 bytes.
    ///      Source: https://github.com/lukso-network/LIPs/blob/main/LSPs/LSP-6-KeyManager.md
    bytes10 private constant LSP6_PERMISSIONS_PREFIX = bytes10(0x4b80742de2bf82acb363);

    /// @dev LSP2 Array key for AddressPermissions[].
    ///      = keccak256("AddressPermissions[]") = 0xdf30dba06db6a30e65354d9a64c609861f089545ca58c6b4dbe31a5f338cb0e3
    ///      Stores the number of registered controllers (uint128). Writing this key
    ///      alongside per-index element keys makes controllers visible to erc725-inspect
    ///      and other LSP6-aware tooling.
    bytes32 private constant AP_ARRAY_KEY =
        0xdf30dba06db6a30e65354d9a64c609861f089545ca58c6b4dbe31a5f338cb0e3;

    /// @dev First 16 bytes of AP_ARRAY_KEY — combined with bytes16(uint128(index)) to form
    ///      individual element keys per the LSP2 Array element key standard.
    bytes16 private constant AP_ARRAY_KEY_PREFIX = 0xdf30dba06db6a30e65354d9a64c60986;

    constructor() Ownable() {}

    /// @notice Grant or revoke permission to call deployVaultOnBehalf.
    /// @param caller   The factory/contract address to authorize
    /// @param authorized True to grant, false to revoke
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
    ///         FIX #26: chainId allows off-chain indexers to build cross-chain vault maps.
    event VaultDeployed(
        address indexed owner,
        address indexed safe,
        address indexed keyManager,
        address policyEngine,
        string  label,
        uint256 chainId
    );

    struct DeployParams {
        uint256 budget;
        BudgetPolicy.Period period;
        /// @dev address(0) for LYX budget; LSP7 contract address for token budget
        address budgetToken;
        /// @dev Unix timestamp for expiration; 0 = no expiry
        uint256 expiration;
        /// @dev Agent addresses to grant CALL + AllowedCalls permissions (max 20)
        address[] agents;
        /// @dev Individual budgets for each agent (optional; must match agents.length if provided)
        ///      If empty, AgentBudgetPolicy is not deployed.
        ///      Otherwise, must be same length as agents array.
        uint256[] agentBudgets;
        /// @dev Initial merchant whitelist (max 100 per batch; triggers MerchantPolicy deployment)
        address[] merchants;
        string label;
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /// @dev Append a controller to AddressPermissions[] in the safe's ERC725Y storage.
    ///      Implements the LSP2 Array element key standard so LSP6 tooling (erc725-inspect,
    ///      LUKSO extension) can enumerate all controllers without off-chain indexers.
    ///
    ///      Element key = AP_ARRAY_KEY_PREFIX (16 bytes) + uint128(index) as bytes16.
    ///      Array length key = AP_ARRAY_KEY, value = abi.encodePacked(uint128(index + 1)).
    ///
    ///      MUST be called with sequential index values starting at 0 for each new safe,
    ///      because this function always writes the length as (index + 1).
    ///
    /// @param safe       The AgentSafe being configured (factory is owner at call time)
    /// @param controller The controller address to append
    /// @param index      Zero-based position within the array (0 = first controller)
    function _appendToAddressPermissionsArray(
        AgentSafe safe,
        address controller,
        uint128 index
    ) private {
        // Element key: first 16 bytes of the array hash + 16-byte big-endian index
        bytes32 elementKey = bytes32(abi.encodePacked(AP_ARRAY_KEY_PREFIX, bytes16(index)));
        safe.setData(elementKey, abi.encodePacked(bytes20(controller)));
        // Array length stored as packed uint128 (16 bytes, big-endian)
        safe.setData(AP_ARRAY_KEY, abi.encodePacked(uint128(index + 1)));
    }

    // ─── Deployment ───────────────────────────────────────────────────────────

    function deployVault(DeployParams calldata p) external returns (VaultRecord memory record) {
        // FIX #20: limit agents array to prevent gas exhaustion in this loop
        require(p.agents.length <= 20, "Registry: too many agents");

        // Validate agent budgets if provided
        if (p.agentBudgets.length > 0) {
            require(p.agentBudgets.length == p.agents.length, "Registry: agentBudgets length mismatch");
        }

        // 1. Deploy AgentSafe — factory is temp owner
        AgentSafe safe = new AgentSafe(address(this));

        // 2. Deploy PolicyEngine linked to safe
        //    FIX #9: PolicyEngine constructor takes safe address for onlySafe guard
        PolicyEngine pe = new PolicyEngine(address(this), address(safe));

        // 3. Deploy BudgetPolicy (vault-level budget)
        //    FIX #18: pass PolicyEngine address so BudgetPolicy can enforce onlyPolicyEngine
        BudgetPolicy budgetPolicy = new BudgetPolicy(
            address(this),
            address(pe),
            p.budget,
            p.period,
            p.budgetToken
        );
        pe.addPolicy(address(budgetPolicy));

        // 4. Optionally deploy MerchantPolicy
        if (p.merchants.length > 0) {
            require(p.merchants.length <= 100, "Registry: too many merchants");
            // FIX #23: pass policyEngine so MerchantPolicy can enforce onlyPolicyEngine
            MerchantPolicy mp = new MerchantPolicy(address(this), address(pe));
            mp.addMerchants(p.merchants);
            pe.addPolicy(address(mp));
            mp.transferOwnership(msg.sender);
        }

        // 5. Optionally deploy ExpirationPolicy
        if (p.expiration > 0) {
            require(p.expiration > block.timestamp, "Registry: expiration in the past");
            // FIX #23: same pattern
            ExpirationPolicy ep = new ExpirationPolicy(address(this), address(pe), p.expiration);
            pe.addPolicy(address(ep));
            ep.transferOwnership(msg.sender);
        }

        // 6. Optionally deploy AgentBudgetPolicy (agent-level budgets)
        //    Hybrid budget model: BudgetPolicy (vault) + AgentBudgetPolicy (agent)
        if (p.agentBudgets.length > 0) {
            AgentBudgetPolicy agentBudgetPolicy = new AgentBudgetPolicy(
                address(this),
                address(pe),
                p.period,
                p.budgetToken
            );
            // Set budget for each agent
            for (uint256 i = 0; i < p.agents.length; i++) {
                agentBudgetPolicy.setAgentBudget(p.agents[i], p.agentBudgets[i]);
            }
            // Sync period boundaries with BudgetPolicy to prevent inter-policy drift.
            // Both policies must share the same period start so per-agent and vault-level
            // budgets reset at identical moments. Must be called before transferOwnership.
            agentBudgetPolicy.syncPeriodStart(budgetPolicy.periodStart());
            pe.addPolicy(address(agentBudgetPolicy));
            agentBudgetPolicy.transferOwnership(msg.sender);
        }
        safe.setPolicyEngine(address(pe));

        // 8. Deploy LSP6 KeyManager targeting this safe
        LSP6KeyManager km = new LSP6KeyManager(address(safe));

        // 9. Link KM to Safe
        safe.setKeyManager(address(km));

        // 10. Write owner SUPER_* permissions into safe's ERC725Y storage
        //    FIX #7: owner must be a controller so they can use the vault via KM in dApp UI
        //    ALL_PERMISSIONS = type(uint256).max per LSP6 — all bits set
        //    Key format: bytes10_prefix + bytes2(0) + bytes20_address (LSP2 MappingWithGrouping)
        bytes32 superPerm = bytes32(type(uint256).max);
        safe.setData(
            bytes32(abi.encodePacked(
                LSP6_PERMISSIONS_PREFIX, // AddressPermissions:Permissions: prefix
                bytes2(0),
                bytes20(msg.sender)
            )),
            abi.encodePacked(superPerm)
        );
        // Register owner in AddressPermissions[] so LSP6 tooling (erc725-inspect) sees all controllers
        uint128 apIdx = 0;
        _appendToAddressPermissionsArray(safe, msg.sender, apIdx++);

        // 11. Write permissions for each agent
        //     Agents use ERC725X.execute through the KM (the LUKSO standard call path):
        //       km.execute(abi.encodeCall(IERC725X.execute, (0, target, value, data)))
        //     Policy validation runs inside AgentSafe.execute() override when msg.sender == KM.
        //
        //     LSP6 does not allow fully-wildcarded AllowedCalls (would revert InvalidWhitelistedCall).
        //     Instead we grant SUPER_CALL | SUPER_TRANSFERVALUE which bypasses AllowedCalls checks.
        //     All actual restrictions (merchant whitelist, budget, expiry) are enforced by PolicyEngine.
        //
        //     _PERMISSION_SUPER_CALL (0x400) | _PERMISSION_SUPER_TRANSFERVALUE (0x100) = 0x500

        bytes32 agentPerm = bytes32(uint256(0x0000000000000000000000000000000000000000000000000000000000000500));

        for (uint256 i = 0; i < p.agents.length; i++) {
            address agentAddr = p.agents[i];
            // Permission key: AddressPermissions:Permissions:<agent>
            safe.setData(
                bytes32(abi.encodePacked(
                    LSP6_PERMISSIONS_PREFIX,
                    bytes2(0),
                    bytes20(agentAddr)
                )),
                abi.encodePacked(agentPerm)
            );
            _appendToAddressPermissionsArray(safe, agentAddr, apIdx++);
        }

        // 12. Transfer ownership to user (LSP14 two-step — user calls acceptOwnership() next)
        safe.transferOwnership(msg.sender);
        pe.transferOwnership(msg.sender);
        budgetPolicy.transferOwnership(msg.sender);

        // 13. Register vault
        record = VaultRecord(address(safe), address(km), address(pe), p.label);
        _ownerVaults[msg.sender].push(record);
        safeToKeyManager[address(safe)] = address(km);
        safeToPolicyEngine[address(safe)] = address(pe);

        // FIX #26: chainId in event for cross-chain indexer
        emit VaultDeployed(
            msg.sender,
            address(safe),
            address(km),
            address(pe),
            p.label,
            block.chainid
        );
    }

    /// @notice Deploy vault on behalf of another address (for factory contracts like TemplateFactory).
    /// @dev Same as deployVault() but registers vault under the specified owner, not msg.sender.
    ///      Used by TemplateFactory to ensure the actual user (not the factory) owns the vault.
    ///      Caller MUST be pre-authorized via setAuthorizedCaller() — prevents griefing attacks
    ///      where malicious callers register arbitrary vaults under victims' addresses.
    /// @param owner The address that will own the deployed vault
    /// @param p Deployment parameters
    /// @return record VaultRecord for tracking
    function deployVaultOnBehalf(address owner, DeployParams calldata p)
        external
        returns (VaultRecord memory record)
    {
        require(authorizedCallers[msg.sender], "Registry: caller not authorized");
        require(owner != address(0), "Registry: zero owner");

        // FIX #20: limit agents array to prevent gas exhaustion in this loop
        require(p.agents.length <= 20, "Registry: too many agents");

        // Validate agent budgets if provided
        if (p.agentBudgets.length > 0) {
            require(p.agentBudgets.length == p.agents.length, "Registry: agentBudgets length mismatch");
        }

        // 1. Deploy AgentSafe — factory is temp owner
        AgentSafe safe = new AgentSafe(address(this));

        // 2. Deploy PolicyEngine linked to safe
        PolicyEngine pe = new PolicyEngine(address(this), address(safe));

        // 3. Deploy BudgetPolicy (vault-level budget)
        BudgetPolicy budgetPolicy = new BudgetPolicy(
            address(this),
            address(pe),
            p.budget,
            p.period,
            p.budgetToken
        );
        pe.addPolicy(address(budgetPolicy));

        // 4. Optionally deploy MerchantPolicy
        if (p.merchants.length > 0) {
            require(p.merchants.length <= 100, "Registry: too many merchants");
            MerchantPolicy mp = new MerchantPolicy(address(this), address(pe));
            mp.addMerchants(p.merchants);
            pe.addPolicy(address(mp));
            mp.transferOwnership(owner);  // Transfer to actual owner, not msg.sender
        }

        // 5. Optionally deploy ExpirationPolicy
        if (p.expiration > 0) {
            require(p.expiration > block.timestamp, "Registry: expiration in the past");
            ExpirationPolicy ep = new ExpirationPolicy(address(this), address(pe), p.expiration);
            pe.addPolicy(address(ep));
            ep.transferOwnership(owner);  // Transfer to actual owner, not msg.sender
        }

        // 6. Optionally deploy AgentBudgetPolicy (agent-level budgets)
        if (p.agentBudgets.length > 0) {
            AgentBudgetPolicy agentBudgetPolicy = new AgentBudgetPolicy(
                address(this),
                address(pe),
                p.period,
                p.budgetToken
            );
            // Set budget for each agent
            for (uint256 i = 0; i < p.agents.length; i++) {
                agentBudgetPolicy.setAgentBudget(p.agents[i], p.agentBudgets[i]);
            }
            // Sync period boundaries with BudgetPolicy to prevent inter-policy drift
            agentBudgetPolicy.syncPeriodStart(budgetPolicy.periodStart());
            pe.addPolicy(address(agentBudgetPolicy));
            agentBudgetPolicy.transferOwnership(owner);  // Transfer to actual owner, not msg.sender
        }

        // 7. Link PolicyEngine to Safe
        safe.setPolicyEngine(address(pe));

        // 8. Deploy LSP6 KeyManager targeting this safe
        LSP6KeyManager km = new LSP6KeyManager(address(safe));

        // 9. Link KM to Safe
        safe.setKeyManager(address(km));

        // 10. Write owner SUPER_* permissions into safe's ERC725Y storage
        bytes32 superPerm = bytes32(type(uint256).max);
        safe.setData(
            bytes32(abi.encodePacked(
                LSP6_PERMISSIONS_PREFIX,
                bytes2(0),
                bytes20(owner)  // Use provided owner, not msg.sender
            )),
            abi.encodePacked(superPerm)
        );
        // Register owner in AddressPermissions[] for LSP6 tooling compatibility
        uint128 apIdx = 0;
        _appendToAddressPermissionsArray(safe, owner, apIdx++);

        // 11. Write permissions for each agent
        bytes32 agentPerm = bytes32(uint256(0x0000000000000000000000000000000000000000000000000000000000000500));

        for (uint256 i = 0; i < p.agents.length; i++) {
            address agentAddr = p.agents[i];
            safe.setData(
                bytes32(abi.encodePacked(
                    LSP6_PERMISSIONS_PREFIX,
                    bytes2(0),
                    bytes20(agentAddr)
                )),
                abi.encodePacked(agentPerm)
            );
            _appendToAddressPermissionsArray(safe, agentAddr, apIdx++);
        }

        // 12. Transfer ownership to the provided owner address
        safe.transferOwnership(owner);
        pe.transferOwnership(owner);
        budgetPolicy.transferOwnership(owner);

        // 13. Register vault under the provided owner address
        record = VaultRecord(address(safe), address(km), address(pe), p.label);
        _ownerVaults[owner].push(record);  // Use provided owner, not msg.sender
        safeToKeyManager[address(safe)] = address(km);
        safeToPolicyEngine[address(safe)] = address(pe);

        // Emit event with provided owner address
        emit VaultDeployed(
            owner,
            address(safe),
            address(km),
            address(pe),
            p.label,
            block.chainid
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
}
