// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPolicy} from "./IPolicy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SharedBudgetPolicy
/// @notice Enforces spending limits using SharedBudgetPool (nested DAG pools).
/// This policy enables multi-vault budget coordination and hierarchy enforcement.
/// Used INSTEAD of BudgetPolicy when vaults are part of a SharedBudgetPool.
contract SharedBudgetPolicy is IPolicy, Ownable {

    /// @dev Reference to the SharedBudgetPool contract
    address public sharedBudgetPool;

    /// @dev The PolicyEngine that calls validate()
    address public immutable policyEngine;

    /// @dev Which vault this policy controls (set at deployment)
    address public vault;

    /// @dev Token denomination (address(0) = LYX-only; non-zero = that LSP7 token only)
    address public budgetToken;

    // ═════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═════════════════════════════════════════════════════════════════════

    event SharedBudgetPoolUpdated(address indexed newPool);
    event VaultUpdated(address indexed newVault);

    event SharedBudgetSpent(
        address indexed agent,
        address indexed token,
        uint256 amount
    );

    // ═════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═════════════════════════════════════════════════════════════════════

    /// @param initialOwner Factory address (temp owner; transferred to user after setup)
    /// @param _policyEngine The PolicyEngine that calls validate() on this policy
    /// @param _sharedBudgetPool Reference to the SharedBudgetPool contract
    /// @param _vault The vault this policy supervises
    /// @param _budgetToken address(0) for LYX; LSP7 contract address for token budget
    constructor(
        address initialOwner,
        address _policyEngine,
        address _sharedBudgetPool,
        address _vault,
        address _budgetToken
    ) {
        require(_policyEngine != address(0), "SBPolicy: invalid engine");
        require(_sharedBudgetPool != address(0), "SBPolicy: invalid pool");
        require(_vault != address(0), "SBPolicy: invalid vault");

        _transferOwnership(initialOwner);
        policyEngine = _policyEngine;
        sharedBudgetPool = _sharedBudgetPool;
        vault = _vault;
        budgetToken = _budgetToken;
    }

    // ═════════════════════════════════════════════════════════════════════
    // POLICY INTERFACE
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Validate spending against the shared budget pool hierarchy
    /// @dev Only callable by PolicyEngine. Enforces nested budget constraints.
    function validate(
        address agent,
        address token,
        address,
        uint256 amount,
        bytes calldata
    ) external override {
        require(msg.sender == policyEngine, "SBPolicy: only PolicyEngine");

        // FIX #8: enforce denomination — reject wrong token type
        require(token == budgetToken, "SBPolicy: wrong denomination");

        // Call SharedBudgetPool to validate and record spending
        // The pool walks up the parent chain and validates at each level
        ISharedBudgetPool(sharedBudgetPool).recordSpend(vault, amount);

        emit SharedBudgetSpent(agent, token, amount);
    }

    // ═════════════════════════════════════════════════════════════════════
    // OWNER FUNCTIONS
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Update the SharedBudgetPool reference
    function setSharedBudgetPool(address newPool) external onlyOwner {
        require(newPool != address(0), "SBPolicy: invalid pool");
        sharedBudgetPool = newPool;
        emit SharedBudgetPoolUpdated(newPool);
    }

    /// @notice Update the vault reference (in case of migration)
    function setVault(address newVault) external onlyOwner {
        require(newVault != address(0), "SBPolicy: invalid vault");
        vault = newVault;
        emit VaultUpdated(newVault);
    }

    // ═════════════════════════════════════════════════════════════════════
    // HELPER INTERFACE (for minimal SharedBudgetPool interaction)
    // ═════════════════════════════════════════════════════════════════════
}

/// @notice Minimal interface for SharedBudgetPool (only needed by SharedBudgetPolicy)
interface ISharedBudgetPool {
    function recordSpend(address vault, uint256 amount) external;
}
