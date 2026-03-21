// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title VaultDirectory
/// @notice Metadata registry for vault hierarchies and labels.
///         Pure data layer — no enforcement, no fund control.
///         Used by dashboards, indexers, and AI agents to discover vault relationships.
contract VaultDirectory is Ownable {

    struct VaultNode {
        address vault;
        string  label;       // Human-readable name ("Operations", "Marketing", etc.)
        bytes32 linkedPool;  // Reference to SharedBudgetPool pool ID (bytes32(0) if none)
        bool    registered;
    }

    mapping(address => VaultNode) public vaults;
    address[] public allVaults;

    uint256 public constant MAX_SAFE_BATCH = 500;

    // ─── Events ───────────────────────────────────────────────────────────────

    event VaultRegistered(address indexed vault, string label, bytes32 linkedPool);
    event VaultLabelUpdated(address indexed vault, string newLabel);
    event PoolLinkUpdated(address indexed vault, bytes32 newPool);
    event VaultUnregistered(address indexed vault);

    // ─── Registration ─────────────────────────────────────────────────────────

    /// @notice Register a vault with metadata.
    function registerVault(
        address vault,
        string calldata label,
        bytes32 linkedPool
    ) external onlyOwner {
        require(vault != address(0), "VD: invalid vault");
        require(bytes(label).length > 0 && bytes(label).length <= 128, "VD: invalid label");
        require(!vaults[vault].registered, "VD: vault already registered");

        vaults[vault] = VaultNode({ vault: vault, label: label, linkedPool: linkedPool, registered: true });
        allVaults.push(vault);
        emit VaultRegistered(vault, label, linkedPool);
    }

    /// @notice Update a vault's human-readable label.
    function updateVaultLabel(address vault, string calldata newLabel) external onlyOwner {
        require(vault != address(0), "VD: invalid vault");
        require(bytes(newLabel).length > 0 && bytes(newLabel).length <= 128, "VD: invalid label");
        require(vaults[vault].registered, "VD: vault not registered");
        vaults[vault].label = newLabel;
        emit VaultLabelUpdated(vault, newLabel);
    }

    /// @notice Update the pool link for a vault.
    function updatePoolLink(address vault, bytes32 newPool) external onlyOwner {
        require(vault != address(0), "VD: invalid vault");
        require(vaults[vault].registered, "VD: vault not registered");
        vaults[vault].linkedPool = newPool;
        emit PoolLinkUpdated(vault, newPool);
    }

    /// @notice Unregister a vault (swap-and-pop).
    function unregisterVault(address vault) external onlyOwner {
        require(vault != address(0), "VD: invalid vault");
        require(vaults[vault].registered, "VD: vault not registered");
        delete vaults[vault];
        for (uint256 i = 0; i < allVaults.length; i++) {
            if (allVaults[i] == vault) {
                allVaults[i] = allVaults[allVaults.length - 1];
                allVaults.pop();
                break;
            }
        }
        emit VaultUnregistered(vault);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    function getVault(address vault)
        external
        view
        returns (address vaultAddr, string memory label, bytes32 linkedPool, bool registered)
    {
        VaultNode storage node = vaults[vault];
        return (node.vault, node.label, node.linkedPool, node.registered);
    }

    function getVaultLabel(address vault) external view returns (string memory) {
        require(vaults[vault].registered, "VD: vault not found");
        return vaults[vault].label;
    }

    function getVaultPool(address vault) external view returns (bytes32) {
        require(vaults[vault].registered, "VD: vault not found");
        return vaults[vault].linkedPool;
    }

    function getVaultCount() external view returns (uint256) {
        return allVaults.length;
    }

    /// @notice Get a paginated slice of vaults.
    function getVaults(uint256 offset, uint256 limit) external view returns (address[] memory) {
        require(offset < allVaults.length || allVaults.length == 0, "VD: invalid offset");
        uint256 actualLimit = limit;
        if (offset + limit > allVaults.length) {
            actualLimit = allVaults.length - offset;
        }
        address[] memory result = new address[](actualLimit);
        for (uint256 i = 0; i < actualLimit; i++) {
            result[i] = allVaults[offset + i];
        }
        return result;
    }

    /// @notice Get all vaults (reverts if count exceeds MAX_SAFE_BATCH).
    function getAllVaults() external view returns (address[] memory) {
        require(allVaults.length <= MAX_SAFE_BATCH, "VD: too many vaults, use paginated getVaults()");
        return allVaults;
    }

    function isVaultRegistered(address vault) external view returns (bool) {
        return vaults[vault].registered;
    }
}
