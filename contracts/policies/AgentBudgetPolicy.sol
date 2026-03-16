// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPolicy} from "./IPolicy.sol";
import {BudgetPolicy} from "./BudgetPolicy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IPolicyEngineSimulationABP {
    function simulationActive() external view returns (bool);
}

/// @title AgentBudgetPolicy
/// @notice Enforces per-agent spending budgets with periodic reset.
///         Works alongside BudgetPolicy to create a hybrid budget model:
///         - BudgetPolicy: vault-level budget (global limit)
///         - AgentBudgetPolicy: agent-level budget (individual limits)
///
///         Both are validated in sequence by PolicyEngine.
///
/// @dev FIX: Two-tier budget system prevents:
///      - Agent starvation (individual limits)
///      - Budget overflow (vault-level enforcement)
///      - Overcomplicated logic (separate policies, independent resets)
contract AgentBudgetPolicy is IPolicy, Ownable {
    /// @dev Only the registered PolicyEngine can call validate()
    address public immutable policyEngine;

    /// @notice Per-agent spending budget (in wei for LYX; token units for LSP7)
    mapping(address => uint256) public agentBudget;

    /// @notice Per-agent spending counter (resets lazily on period boundary)
    mapping(address => uint256) public agentSpent;

    /// @notice Per-agent: the periodStart value at which their counter was last reset.
    ///         If agentLastPeriodStart[agent] < periodStart, their counter is stale
    ///         and will be zeroed on the next validate() call (lazy reset).
    mapping(address => uint256) public agentLastPeriodStart;

    /// @notice When the current period started (shared across all agents)
    uint256 public periodStart;

    /// @notice Total number of distinct agents with a budget (for MAX_AGENTS cap)
    uint256 public agentCount;

    /// @notice Reset frequency: DAILY, WEEKLY, or MONTHLY (shared with BudgetPolicy)
    BudgetPolicy.Period public period;

    /// @notice Token denomination: address(0) = LYX; non-zero = LSP7 only
    address public budgetToken;

    /// @notice MAX_AGENTS cap to prevent unbounded loop in reset logic
    uint256 public constant MAX_AGENTS = 100;

    event AgentBudgetSet(address indexed agent, uint256 newBudget);
    event AgentBudgetSpent(address indexed agent, address indexed token, uint256 amount, uint256 newSpent);
    event PeriodReset(uint256 newPeriodStart);

    /// @param initialOwner   Factory address (temp owner; transferred to user after setup)
    /// @param _policyEngine  The PolicyEngine that calls validate()
    /// @param _period        Reset frequency: DAILY, WEEKLY, or MONTHLY
    /// @param _budgetToken   address(0) for LYX; LSP7 contract address for token budget
    constructor(
        address initialOwner,
        address _policyEngine,
        BudgetPolicy.Period _period,
        address _budgetToken
    ) {
        require(_policyEngine != address(0), "ABP: zero policyEngine");
        require(uint8(_period) <= 2, "ABP: invalid period");
        policyEngine = _policyEngine;
        period = _period;
        budgetToken = _budgetToken;
        periodStart = block.timestamp;
        _transferOwnership(initialOwner);
    }

    /// @notice Validate that agent's spending does not exceed their individual budget.
    ///         Called by PolicyEngine after BudgetPolicy validates vault-level budget.
    function validate(
        address agent,
        address token,
        address,
        uint256 amount,
        bytes calldata
    ) external override {
        require(msg.sender == policyEngine, "ABP: only PolicyEngine");

        // FIX: enforce denomination matching BudgetPolicy
        require(token == budgetToken, "ABP: wrong denomination");

        _maybeResetPeriod();

        // Lazy per-agent reset: if the agent hasn't transacted in the current period,
        // their spent counter is stale — zero it before checking.
        if (agentLastPeriodStart[agent] < periodStart) {
            agentSpent[agent] = 0;
            agentLastPeriodStart[agent] = periodStart;
        }

        uint256 agentLimit = agentBudget[agent];
        require(agentLimit > 0, "ABP: agent has no budget");

        uint256 newSpent = agentSpent[agent] + amount;
        require(newSpent <= agentLimit, "ABP: agent budget exceeded");

        // CEI: skip state write during simulation — prevents budget drain without real payment.
        if (!IPolicyEngineSimulationABP(policyEngine).simulationActive()) {
            agentSpent[agent] = newSpent;
            emit AgentBudgetSpent(agent, token, amount, newSpent);
        }
    }

    /// @notice Synchronize periodStart with a companion BudgetPolicy to prevent drift.
    /// @dev Both policies must share the same period boundaries for correct two-tier budgeting.
    ///      If this policy was deployed at a different time than its BudgetPolicy, call this
    ///      function with `BudgetPolicy.periodStart()` to align them. Emits PeriodReset.
    function syncPeriodStart(uint256 newPeriodStart) external onlyOwner {
        require(newPeriodStart > 0, "ABP: invalid period start");
        require(newPeriodStart <= block.timestamp, "ABP: period start in future");
        periodStart = newPeriodStart;
        emit PeriodReset(newPeriodStart);
    }

    /// @notice Set an agent's budget for their spending limit.
    ///         Only owner (dApp) can set agent budgets.
    function setAgentBudget(address agent, uint256 budget) external onlyOwner {
        require(agent != address(0), "ABP: zero agent");
        require(budget > 0, "ABP: budget must be > 0");
        // Enforce MAX_AGENTS cap only for new registrations (budget was 0 before)
        if (agentBudget[agent] == 0) {
            require(agentCount < MAX_AGENTS, "ABP: too many agents");
            agentCount++;
        }
        agentBudget[agent] = budget;
        emit AgentBudgetSet(agent, budget);
    }

    /// @notice Batch set budgets for multiple agents.
    /// @param agents Array of agent addresses
    /// @param budgets Array of budget amounts (parallel to agents)
    function setAgentBudgetsBatch(address[] calldata agents, uint256[] calldata budgets) external onlyOwner {
        require(agents.length == budgets.length, "ABP: array length mismatch");
        require(agents.length <= MAX_AGENTS, "ABP: batch too large");
        for (uint256 i = 0; i < agents.length; i++) {
            require(agents[i] != address(0), "ABP: zero agent");
            require(budgets[i] > 0, "ABP: budget must be > 0");
            // Enforce MAX_AGENTS cap only for new registrations
            if (agentBudget[agents[i]] == 0) {
                require(agentCount < MAX_AGENTS, "ABP: too many agents");
                agentCount++;
            }
            agentBudget[agents[i]] = budgets[i];
            emit AgentBudgetSet(agents[i], budgets[i]);
        }
    }

    /// @notice Get agent's remaining budget for current period.
    function getAgentRemaining(address agent) external view returns (uint256) {
        uint256 limit = agentBudget[agent];
        uint256 spent = agentSpent[agent];
        return limit > spent ? limit - spent : 0;
    }

    /// @dev Reset per-agent spend counters at period boundary.
    ///      Advances periodStart by full period multiples to avoid drift from late transactions.
    function _maybeResetPeriod() internal {
        uint256 duration = _periodDuration();
        if (block.timestamp >= periodStart + duration) {
            uint256 elapsed = block.timestamp - periodStart;
            periodStart += (elapsed / duration) * duration;
            emit PeriodReset(periodStart);
        }
    }

    /// @dev Get duration of current period in seconds.
    function _periodDuration() internal view returns (uint256) {
        if (period == BudgetPolicy.Period.DAILY) return 1 days;
        if (period == BudgetPolicy.Period.WEEKLY) return 7 days;
        return 30 days; // MONTHLY: fixed 30-day period
    }

    /// @notice View function: get period duration.
    function getPeriodDuration() external view returns (uint256) {
        return _periodDuration();
    }

    /// @notice View function: time until next period reset.
    function getTimeUntilReset() external view returns (uint256) {
        uint256 nextReset = periodStart + _periodDuration();
        return block.timestamp < nextReset ? nextReset - block.timestamp : 0;
    }
}
