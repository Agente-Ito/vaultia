// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPolicy} from "./IPolicy.sol";
import {BudgetPolicy} from "./BudgetPolicy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IPolicyEngineSimulationRBP {
    function simulationActive() external view returns (bool);
}

/// @title RecipientBudgetPolicy
/// @notice Enforces per-recipient spending limits with individual periods and lazy resets.
///         Also acts as a whitelist: any recipient not registered will cause a revert.
///
///         Runs in sequence after BudgetPolicy in the PolicyEngine:
///           1. BudgetPolicy:          vault-level global budget (global ceiling)
///           2. RecipientBudgetPolicy: per-recipient sublimit + whitelist enforcement
///
///         Each recipient has its own `limit`, `period`, and `periodStart`. Resets are lazy
///         (only triggered when that recipient receives a payment after the period boundary).
///
///         If `limit == 0`, the recipient is whitelisted with no individual cap (only the
///         vault-level BudgetPolicy applies). If `limit > 0`, the recipient is capped at
///         `limit` per `period`.
contract RecipientBudgetPolicy is IPolicy, Ownable {
    /// @dev Only the registered PolicyEngine can call validate()
    address public immutable policyEngine;

    /// @notice Token denomination: address(0) = LYX; non-zero = LSP7 only
    address public budgetToken;

    struct RecipientLimit {
        bool    registered;   // true = whitelisted (even if limit == 0)
        uint256 limit;        // 0 = whitelist-only (no cap); > 0 = cap active
        uint256 spent;
        uint8   period;       // BudgetPolicy.Period enum value
        uint256 periodStart;
    }

    mapping(address => RecipientLimit) public recipientLimits;
    address[] private _recipients;
    uint256 public recipientCount;
    uint256 public constant MAX_RECIPIENTS = 100;

    event RecipientLimitSet(address indexed recipient, uint256 limit, uint8 period);
    event RecipientLimitSpent(address indexed recipient, address indexed token, uint256 amount, uint256 newSpent);
    event RecipientRemoved(address indexed recipient);

    /// @param initialOwner   Factory address (temp owner; transferred to user after setup)
    /// @param _policyEngine  The PolicyEngine that calls validate()
    /// @param _budgetToken   address(0) for LYX; LSP7 contract address for token budget
    constructor(address initialOwner, address _policyEngine, address _budgetToken) {
        require(_policyEngine != address(0), "RBP: zero policyEngine");
        policyEngine = _policyEngine;
        budgetToken  = _budgetToken;
        _transferOwnership(initialOwner);
    }

    /// @notice Validate that the recipient is whitelisted and within their individual budget.
    ///         Called by PolicyEngine after BudgetPolicy validates the vault-level budget.
    function validate(
        address,
        address token,
        address to,
        uint256 amount,
        bytes calldata
    ) external override {
        require(msg.sender == policyEngine, "RBP: only PolicyEngine");
        require(token == budgetToken, "RBP: wrong denomination");

        RecipientLimit storage rl = recipientLimits[to];
        require(rl.registered, "RBP: not whitelisted");

        // Whitelist-only mode: limit == 0 means no individual cap.
        if (rl.limit == 0) return;

        // Lazy reset: advance periodStart if period boundary has been crossed.
        _maybeResetRecipient(rl);

        require(rl.spent + amount <= rl.limit, "RBP: recipient limit exceeded");

        // CEI: skip state write during simulation — prevents budget drain without real payment.
        if (!IPolicyEngineSimulationRBP(policyEngine).simulationActive()) {
            rl.spent += amount;
            emit RecipientLimitSpent(to, token, amount, rl.spent);
        }
    }

    /// @notice Add or update a recipient's whitelist entry and optional spend limit.
    /// @param recipient  The recipient address to whitelist.
    /// @param limit      Max spend per period (0 = whitelist-only, no cap).
    /// @param period     Reset frequency (BudgetPolicy.Period enum value).
    function setRecipientLimit(
        address recipient,
        uint256 limit,
        BudgetPolicy.Period period
    ) external onlyOwner {
        require(recipient != address(0), "RBP: zero recipient");
        require(uint8(period) <= 4, "RBP: invalid period");
        RecipientLimit storage rl = recipientLimits[recipient];
        if (!rl.registered) {
            require(recipientCount < MAX_RECIPIENTS, "RBP: too many recipients");
            recipientCount++;
            _recipients.push(recipient);
            rl.periodStart = block.timestamp;
        }
        rl.registered = true;
        rl.limit  = limit;
        rl.period = uint8(period);
        // Reset spent when limit or period changes so the new cap starts fresh.
        rl.spent  = 0;
        emit RecipientLimitSet(recipient, limit, uint8(period));
    }

    /// @notice Batch set limits for multiple recipients.
    function setRecipientLimitsBatch(
        address[] calldata recipients,
        uint256[]  calldata limits,
        BudgetPolicy.Period[] calldata periods
    ) external onlyOwner {
        require(
            recipients.length == limits.length && recipients.length == periods.length,
            "RBP: array length mismatch"
        );
        require(recipients.length <= MAX_RECIPIENTS, "RBP: batch too large");
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "RBP: zero recipient");
            require(uint8(periods[i]) <= 4, "RBP: invalid period");
            RecipientLimit storage rl = recipientLimits[recipients[i]];
            if (!rl.registered) {
                require(recipientCount < MAX_RECIPIENTS, "RBP: too many recipients");
                recipientCount++;
                _recipients.push(recipients[i]);
                rl.periodStart = block.timestamp;
            }
            rl.registered = true;
            rl.limit  = limits[i];
            rl.period = uint8(periods[i]);
            rl.spent  = 0;
            emit RecipientLimitSet(recipients[i], limits[i], uint8(periods[i]));
        }
    }

    /// @notice Remove a recipient from the whitelist (swap-and-pop for gas efficiency).
    function removeRecipient(address recipient) external onlyOwner {
        require(recipientLimits[recipient].registered, "RBP: not registered");
        delete recipientLimits[recipient];
        recipientCount--;
        for (uint256 i = 0; i < _recipients.length; i++) {
            if (_recipients[i] == recipient) {
                _recipients[i] = _recipients[_recipients.length - 1];
                _recipients.pop();
                break;
            }
        }
        emit RecipientRemoved(recipient);
    }

    /// @notice Returns the remaining budget for a recipient in the current period.
    ///         Returns type(uint256).max for whitelist-only recipients (no cap).
    function getRecipientRemaining(address recipient) external view returns (uint256) {
        RecipientLimit storage rl = recipientLimits[recipient];
        if (!rl.registered || rl.limit == 0) return type(uint256).max;
        if (rl.spent >= rl.limit) return 0;
        return rl.limit - rl.spent;
    }

    /// @notice Returns all registered recipient addresses (for UI enumeration).
    function getRecipients() external view returns (address[] memory) {
        return _recipients;
    }

    /// @dev Lazy reset: advance periodStart if the period boundary has been crossed.
    ///      Uses drift-corrected advance to avoid cumulative drift from late transactions.
    function _maybeResetRecipient(RecipientLimit storage rl) internal {
        uint256 duration = _periodDuration(rl.period);
        if (block.timestamp >= rl.periodStart + duration) {
            rl.spent = 0;
            uint256 elapsed = block.timestamp - rl.periodStart;
            rl.periodStart += (elapsed / duration) * duration;
        }
    }

    function _periodDuration(uint8 p) internal pure returns (uint256) {
        if (p == uint8(BudgetPolicy.Period.DAILY))   return 1 days;
        if (p == uint8(BudgetPolicy.Period.WEEKLY))  return 7 days;
        if (p == uint8(BudgetPolicy.Period.MONTHLY)) return 30 days;
        if (p == uint8(BudgetPolicy.Period.HOURLY))  return 1 hours;
        return 5 minutes; // FIVE_MINUTES — demo/testing only
    }
}
