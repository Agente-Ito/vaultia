// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPolicy} from "../../policies/IPolicy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IPolicyEngineSimulation {
    function simulationActive() external view returns (bool);
}

/// @title MultiTokenBudgetPolicy
/// @notice Enforces per-token spending budgets with periodic reset.
///         Designed for BaseAgentVault where a vault may hold and spend multiple
///         ERC-20 tokens (USDC, WETH, cbBTC, etc.) or native ETH.
///
///         Each token has its own independent budget and period. Tokens not
///         explicitly configured are rejected by default — safe fail-closed posture.
///
///         Mirrors the simulation-aware design of BudgetPolicy: skips `spent`
///         counter writes when PolicyEngine.simulationActive() is true, preventing
///         budget drain during dry-run previews.
///
///         Period reset uses no-drift arithmetic (same as BudgetPolicy) so late
///         transactions don't push the next reset forward by their delay.
contract MultiTokenBudgetPolicy is IPolicy, Ownable {

    enum Period { DAILY, WEEKLY, MONTHLY }

    struct TokenBudget {
        uint256 limit;          // maximum spend per period (token decimals)
        uint256 spent;          // accumulated spend this period
        Period  period;         // reset frequency
        uint256 periodStart;    // timestamp of current period start
        bool    configured;     // false = token not allowed
    }

    /// @dev Only the registered PolicyEngine can call validate()
    address public immutable policyEngine;

    /// @dev token address → budget state. address(0) = native ETH.
    mapping(address => TokenBudget) public tokenBudgets;

    /// @dev Ordered list of configured tokens for enumeration.
    address[] private _configuredTokens;

    event TokenBudgetSet(address indexed token, uint256 limit, Period period);
    event TokenBudgetRemoved(address indexed token);
    event TokenBudgetSpent(
        address indexed agent,
        address indexed token,
        uint256 amount,
        uint256 newSpent
    );
    event PeriodReset(address indexed token, uint256 newPeriodStart);

    /// @param initialOwner  Factory address (temp owner; transferred to user after setup)
    /// @param _policyEngine The PolicyEngine that calls validate() on this policy
    constructor(address initialOwner, address _policyEngine) {
        require(_policyEngine != address(0), "MTBP: zero policyEngine");
        policyEngine = _policyEngine;
        _transferOwnership(initialOwner);
    }

    // ─── IPolicy ──────────────────────────────────────────────────────────────

    /// @notice Validates that a payment does not exceed the token's budget.
    ///         Reverts with "MTBP: no budget for token" if the token is not configured.
    ///         Reverts with "MTBP: budget exceeded" if the limit would be breached.
    function validate(
        address agent,
        address token,
        address,      /* to — not checked here, MerchantPolicy handles that */
        uint256 amount,
        bytes calldata
    ) external override {
        require(msg.sender == policyEngine, "MTBP: only PolicyEngine");

        TokenBudget storage b = tokenBudgets[token];
        require(b.configured, "MTBP: no budget for token");

        _maybeResetPeriod(b, token);
        require(b.spent + amount <= b.limit, "MTBP: budget exceeded");

        // Skip state write during simulation — same pattern as BudgetPolicy.
        if (!IPolicyEngineSimulation(policyEngine).simulationActive()) {
            b.spent += amount;
            emit TokenBudgetSpent(agent, token, amount, b.spent);
        }
    }

    // ─── Owner management ─────────────────────────────────────────────────────

    /// @notice Configure (or update) the budget for a token.
    ///         Calling again for an already-configured token updates the limit/period
    ///         but does NOT reset the current period's `spent` counter.
    /// @param token  ERC-20 address, or address(0) for native ETH
    /// @param limit  Max spend per period in the token's native units
    /// @param period Reset frequency
    function setBudget(address token, uint256 limit, Period period) external onlyOwner {
        require(limit > 0, "MTBP: limit must be > 0");
        require(uint8(period) <= 2, "MTBP: invalid period");

        TokenBudget storage b = tokenBudgets[token];
        if (!b.configured) {
            _configuredTokens.push(token);
            b.configured   = true;
            b.periodStart  = block.timestamp;
        }
        b.limit  = limit;
        b.period = period;
        emit TokenBudgetSet(token, limit, period);
    }

    /// @notice Remove a token's budget entirely. Future payments in that token will revert.
    function removeBudget(address token) external onlyOwner {
        require(tokenBudgets[token].configured, "MTBP: token not configured");
        delete tokenBudgets[token]; // configured = false after delete

        // Compact the _configuredTokens array
        uint256 len = _configuredTokens.length;
        for (uint256 i = 0; i < len; i++) {
            if (_configuredTokens[i] == token) {
                _configuredTokens[i] = _configuredTokens[len - 1];
                _configuredTokens.pop();
                break;
            }
        }
        emit TokenBudgetRemoved(token);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getConfiguredTokens() external view returns (address[] memory) {
        return _configuredTokens;
    }

    function periodDuration(address token) external view returns (uint256) {
        return _periodDuration(tokenBudgets[token].period);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _maybeResetPeriod(TokenBudget storage b, address token) internal {
        uint256 duration = _periodDuration(b.period);
        if (block.timestamp >= b.periodStart + duration) {
            b.spent = 0;
            uint256 elapsed = block.timestamp - b.periodStart;
            b.periodStart += (elapsed / duration) * duration;
            emit PeriodReset(token, b.periodStart);
        }
    }

    function _periodDuration(Period p) internal pure returns (uint256) {
        if (p == Period.DAILY)  return 1 days;
        if (p == Period.WEEKLY) return 7 days;
        return 30 days; // MONTHLY: fixed 30-day rolling window
    }
}
