// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title VaultDirectory
/// @notice Metadata registry for vault hierarchies and labels.
/// Pure data layer - no enforcement, no fund control.
/// Used for dashboards, indexing, and AI agent visibility.
contract VaultDirectory is Ownable {

    struct VaultNode {
        address vault;
        string label;              // Human-readable name ("Groceries", "Utilities", etc.)
        bytes32 linkedPool;        // Reference to SharedBudgetPool (if any)
        bool registered;           // Has this vault been registered?
    }

    /// @notice Vault address → metadata node
    mapping(address => VaultNode) public vaults;

    /// @notice All registered vault addresses (for enumeration)
    address[] public allVaults;

    // ═════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═════════════════════════════════════════════════════════════════════

    event VaultRegistered(
        address indexed vault,
        string label,
        bytes32 linkedPool
    );

    event VaultLabelUpdated(address indexed vault, string newLabel);
    event PoolLinkUpdated(address indexed vault, bytes32 newPool);
    event VaultUnregistered(address indexed vault);

    // ═════════════════════════════════════════════════════════════════════
    // REGISTRATION
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Register a vault with metadata
    /// @param vault The AgentSafe vault address
    /// @param label Human-readable name
    /// @param linkedPool Optional reference to SharedBudgetPool (bytes32(0) if none)
    function registerVault(
        address vault,
        string calldata label,
        bytes32 linkedPool
    ) external onlyOwner {
        require(vault != address(0), "VD: invalid vault");
        require(bytes(label).length > 0 && bytes(label).length <= 128, "VD: invalid label");
        require(!vaults[vault].registered, "VD: vault already registered");

        vaults[vault] = VaultNode({
            vault: vault,
            label: label,
            linkedPool: linkedPool,
            registered: true
        });

        allVaults.push(vault);
        emit VaultRegistered(vault, label, linkedPool);
    }

    /// @notice Update a vault's label
    function updateVaultLabel(address vault, string calldata newLabel)
        external
        onlyOwner
    {
        require(vault != address(0), "VD: invalid vault");
        require(bytes(newLabel).length > 0 && bytes(newLabel).length <= 128, "VD: invalid label");
        require(vaults[vault].registered, "VD: vault not registered");

        vaults[vault].label = newLabel;
        emit VaultLabelUpdated(vault, newLabel);
    }

    /// @notice Update a vault's linked pool reference
    function updatePoolLink(address vault, bytes32 newPool)
        external
        onlyOwner
    {
        require(vault != address(0), "VD: invalid vault");
        require(vaults[vault].registered, "VD: vault not registered");

        vaults[vault].linkedPool = newPool;
        emit PoolLinkUpdated(vault, newPool);
    }

    /// @notice Unregister a vault (remove from directory)
    function unregisterVault(address vault) external onlyOwner {
        require(vault != address(0), "VD: invalid vault");
        require(vaults[vault].registered, "VD: vault not registered");

        delete vaults[vault];

        // Remove from allVaults array
        for (uint i = 0; i < allVaults.length; i++) {
            if (allVaults[i] == vault) {
                allVaults[i] = allVaults[allVaults.length - 1];
                allVaults.pop();
                break;
            }
        }

        emit VaultUnregistered(vault);
    }

    // ═════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Get vault metadata
    function getVault(address vault)
        external
        view
        returns (
            address vaultAddr,
            string memory label,
            bytes32 linkedPool,
            bool registered
        )
    {
        VaultNode storage node = vaults[vault];
        return (node.vault, node.label, node.linkedPool, node.registered);
    }

    /// @notice Get vault's label
    function getVaultLabel(address vault) external view returns (string memory) {
        require(vaults[vault].registered, "VD: vault not found");
        return vaults[vault].label;
    }

    /// @notice Get vault's linked pool
    function getVaultPool(address vault) external view returns (bytes32) {
        require(vaults[vault].registered, "VD: vault not found");
        return vaults[vault].linkedPool;
    }

    /// @notice Get total number of registered vaults
    function getVaultCount() external view returns (uint256) {
        return allVaults.length;
    }

    /// @notice Get paginated list of vaults
    function getVaults(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory)
    {
        require(offset < allVaults.length || allVaults.length == 0, "VD: invalid offset");

        uint256 actualLimit = limit;
        if (offset + limit > allVaults.length) {
            actualLimit = allVaults.length - offset;
        }

        address[] memory result = new address[](actualLimit);
        for (uint i = 0; i < actualLimit; i++) {
            result[i] = allVaults[offset + i];
        }
        return result;
    }

    /// @notice Maximum vaults returned by getAllVaults before callers must paginate.
    uint256 public constant MAX_SAFE_BATCH = 500;

    /// @notice Get all vaults.
    /// @dev Reverts when vault count exceeds MAX_SAFE_BATCH (500) to avoid unbounded
    ///      return arrays that may hit JSON-RPC response limits or client memory limits.
    ///      For large registries call getVaultCount() first and use getVaults(offset, limit).
    function getAllVaults() external view returns (address[] memory) {
        require(allVaults.length <= MAX_SAFE_BATCH, "VD: too many vaults, use paginated getVaults()");
        return allVaults;
    }

    /// @notice Check if a vault is registered
    function isVaultRegistered(address vault) external view returns (bool) {
        return vaults[vault].registered;
    }
}
