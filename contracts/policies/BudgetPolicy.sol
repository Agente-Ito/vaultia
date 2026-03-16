// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPolicy} from "./IPolicy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IPolicyEngineSimulation {
    function simulationActive() external view returns (bool);
}

/// @title BudgetPolicy
/// @notice Enforces a spending budget with periodic reset.
///         FIX #8: validate() receives explicit `token` param and checks denomination.
///         FIX #18: onlyPolicyEngine — msg.sender in validate() is PolicyEngine (not AgentSafe).
///         Call chain: AgentSafe → PolicyEngine → BudgetPolicy
contract BudgetPolicy is IPolicy, Ownable {
    enum Period { DAILY, WEEKLY, MONTHLY }

    /// @dev FIX #18: only the registered PolicyEngine can call validate()
    address public immutable policyEngine;

    uint256 public budget;
    uint256 public spent;
    Period  public period;
    uint256 public periodStart;
    /// @dev FIX #8: address(0) = LYX-only; non-zero = that LSP7 token only
    address public budgetToken;

    event PeriodReset(uint256 newPeriodStart);
    event BudgetUpdated(uint256 newBudget);
    /// @dev FIX #25: spend analytics for dashboards and indexers
    event BudgetSpent(address indexed agent, address indexed token, uint256 amount, uint256 newSpent);

    /// @param initialOwner   Factory address (temp owner; transferred to user after setup)
    /// @param _policyEngine  The PolicyEngine that calls validate() on this policy
    /// @param _budget        Maximum spend per period (in wei for LYX; token units for LSP7)
    /// @param _period        Reset frequency: DAILY, WEEKLY, or MONTHLY (fixed 30-day)
    /// @param _budgetToken   address(0) for LYX; LSP7 contract address for token budget
    constructor(
        address initialOwner,
        address _policyEngine,
        uint256 _budget,
        Period  _period,
        address _budgetToken
    ) {
        require(_budget > 0, "BP: budget must be > 0");
        require(uint8(_period) <= 2, "BP: invalid period");
        _transferOwnership(initialOwner);
        policyEngine = _policyEngine;
        budget       = _budget;
        period       = _period;
        budgetToken  = _budgetToken;
        periodStart  = block.timestamp;
    }

    function validate(
        address agent,
        address token,
        address,
        uint256 amount,
        bytes calldata
    ) external override {
        require(msg.sender == policyEngine, "BP: only PolicyEngine");
        // FIX #8: enforce denomination — reject wrong token type
        require(token == budgetToken, "BP: wrong denomination");

        _maybeResetPeriod();
        require(spent + amount <= budget, "BP: budget exceeded");
        // CEI: skip state write during simulation — prevents budget drain without real payment.
        // simulationActive() is a view call back into PolicyEngine; no reentrancy concern.
        if (!IPolicyEngineSimulation(policyEngine).simulationActive()) {
            spent += amount;
            emit BudgetSpent(agent, token, amount, spent);
        }
    }

    function ownerSetBudget(uint256 _budget) external onlyOwner {
        require(_budget > 0, "BP: budget must be > 0");
        budget = _budget;
        emit BudgetUpdated(_budget);
    }

    function _maybeResetPeriod() internal {
        uint256 duration = _periodDuration();
        if (block.timestamp >= periodStart + duration) {
            spent = 0;
            // Advance by full period multiples to avoid drift from late-arriving transactions.
            // e.g. if a weekly period is triggered 2 days late, the next reset is still 7 days
            // from the scheduled boundary, not 7 days from now.
            uint256 elapsed = block.timestamp - periodStart;
            periodStart += (elapsed / duration) * duration;
            emit PeriodReset(periodStart);
        }
    }

    /// @notice Returns the duration in seconds for the current budget period.
    /// @dev DAILY=86400s, WEEKLY=604800s, MONTHLY=2592000s (fixed 30 days, not calendar month).
    ///      UIs should display "30-day period" not "monthly" to avoid calendar confusion.
    function periodDuration() external view returns (uint256) {
        return _periodDuration();
    }

    function _periodDuration() internal view returns (uint256) {
        if (period == Period.DAILY)  return 1 days;
        if (period == Period.WEEKLY) return 7 days;
        return 30 days; // MONTHLY: fixed 30-day rolling window (not calendar month)
    }
}
