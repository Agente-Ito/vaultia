// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPolicy} from "./IPolicy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal interface for SharedBudgetPool interaction
interface ISharedBudgetPool {
    function recordSpend(address vault, uint256 amount) external;
}

/// @title SharedBudgetPolicy
/// @notice Enforces spending limits using SharedBudgetPool (nested hierarchical pools).
///         Enables multi-vault budget coordination: spending from a child vault is validated
///         and charged at every ancestor pool level, enforcing a strict budget hierarchy.
///
///         Use this INSTEAD of BudgetPolicy when a vault is part of a SharedBudgetPool.
///         The pool itself holds the budget limits and tracks spending across vaults.
contract SharedBudgetPolicy is IPolicy, Ownable {

    /// @dev The SharedBudgetPool contract that tracks hierarchical budgets
    address public sharedBudgetPool;

    /// @dev The PolicyEngine that calls validate()
    address public immutable policyEngine;

    /// @dev Which vault this policy supervises (set at deployment)
    address public vault;

    /// @dev Token denomination (address(0) = LYX-only; non-zero = that LSP7 token only)
    address public budgetToken;

    // ─── Events ───────────────────────────────────────────────────────────────

    event SharedBudgetPoolUpdated(address indexed newPool);
    event VaultUpdated(address indexed newVault);
    event SharedBudgetSpent(address indexed agent, address indexed token, uint256 amount);

    // ─── Initialization ────────────────────────────────────────────────────────

    /// @param initialOwner      Factory address (temp owner; transferred to user after setup)
    /// @param _policyEngine     The PolicyEngine that calls validate() on this policy
    /// @param _sharedBudgetPool Reference to the SharedBudgetPool contract
    /// @param _vault            The AgentSafe vault this policy supervises
    /// @param _budgetToken      address(0) for LYX; LSP7 contract address for token budget
    constructor(
        address initialOwner,
        address _policyEngine,
        address _sharedBudgetPool,
        address _vault,
        address _budgetToken
    ) {
        require(_policyEngine     != address(0), "SBPolicy: invalid engine");
        require(_sharedBudgetPool != address(0), "SBPolicy: invalid pool");
        require(_vault            != address(0), "SBPolicy: invalid vault");
        _transferOwnership(initialOwner);
        policyEngine     = _policyEngine;
        sharedBudgetPool = _sharedBudgetPool;
        vault            = _vault;
        budgetToken      = _budgetToken;
    }

    // ─── IPolicy ──────────────────────────────────────────────────────────────

    /// @notice Validate spending against the shared budget pool hierarchy.
    ///         Only callable by PolicyEngine. Calls recordSpend() on the pool, which
    ///         walks up the ancestor chain and validates at each level.
    function validate(
        address agent,
        address token,
        address,
        uint256 amount,
        bytes calldata
    ) external override {
        require(msg.sender == policyEngine, "SBPolicy: only PolicyEngine");
        require(token == budgetToken, "SBPolicy: wrong denomination");
        ISharedBudgetPool(sharedBudgetPool).recordSpend(vault, amount);
        emit SharedBudgetSpent(agent, token, amount);
    }

    // ─── Owner functions ──────────────────────────────────────────────────────

    /// @notice Update the SharedBudgetPool reference (e.g. after migration).
    function setSharedBudgetPool(address newPool) external onlyOwner {
        require(newPool != address(0), "SBPolicy: invalid pool");
        sharedBudgetPool = newPool;
        emit SharedBudgetPoolUpdated(newPool);
    }

    /// @notice Update the vault reference (e.g. after migration).
    function setVault(address newVault) external onlyOwner {
        require(newVault != address(0), "SBPolicy: invalid vault");
        vault = newVault;
        emit VaultUpdated(newVault);
    }
}
