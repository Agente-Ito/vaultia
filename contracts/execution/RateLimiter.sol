// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title RateLimiter
/// @notice Companion utility for enforcing rate limits on agent operations.
///         Works alongside AgentSafe to prevent spam/DoS attacks.
///         Agents call this BEFORE attempting execution through AgentSafe.
///
/// @dev ARCHITECTURE:
///   Traditional flow:  KM.execute(AgentSafe.execute(...))
///   With RateLimiter:  RateLimiter.checkRateLimit(agent)
///                         ↓ (if approved)
///                      KM.execute(AgentSafe.execute(...))
///
///   RateLimiter is OPTIONAL - existing vaults work without it.
///   New vaults can opt-in to enforce rate limiting per agent.
contract RateLimiter is Ownable, ReentrancyGuard {

    /// @dev Max calls per block per agent
    uint256 public maxCallsPerBlock = 10;

    /// @dev Track calls in current block
    mapping(address => uint256) public callsInBlock;
    mapping(address => uint256) public lastBlockNumber;

    /// @dev Vaults that have opted-in to rate limiting
    mapping(address => bool) public rateLimitingEnabled;

    // ═════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═════════════════════════════════════════════════════════════════════

    event RateLimitCheckPassed(address indexed agent, uint256 blockNumber, uint256 callCount);
    event RateLimitExceeded(address indexed agent);
    event MaxCallsPerBlockUpdated(uint256 newLimit);
    event RateLimitingEnabledForVault(address indexed vault);

    // ═════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═════════════════════════════════════════================================================================

    constructor(address initialOwner) {
        _transferOwnership(initialOwner);
    }

    // ═════════════════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═════════════════════════════════════════════════════════════════════

    function setMaxCallsPerBlock(uint256 newLimit) external onlyOwner {
        require(newLimit > 0, "RL: invalid limit");
        maxCallsPerBlock = newLimit;
        emit MaxCallsPerBlockUpdated(newLimit);
    }

    function enableRateLimitingForVault(address vault) external onlyOwner {
        require(vault != address(0), "RL: zero vault");
        rateLimitingEnabled[vault] = true;
        emit RateLimitingEnabledForVault(vault);
    }

    // ═════════════════════════════════════════════════════════════════════
    // MAIN FUNCTION
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Check if agent can proceed with a transaction this block.
    ///         OPTIONAL: Call before KM.execute(AgentSafe...) to enforce rate limiting.
    ///
    /// @dev This is a VIEW-like function (nonReentrant for safety).
    ///      Returns true if the agent is within limits, false otherwise.
    ///      Agents with multiple executions per block should check this.
    ///
    /// @param agent Agent address making the request
    /// @return isAllowed true if rate limit allows execution, false if exceeded
    /// @return currentCallCount how many calls this agent has made in current block
    function checkRateLimit(address agent) external nonReentrant returns (bool isAllowed, uint256 currentCallCount) {
        require(agent != address(0), "RL: zero agent");

        uint256 currentBlock = block.number;

        // Reset counter if we're in a new block
        if (lastBlockNumber[agent] < currentBlock) {
            callsInBlock[agent] = 0;
            lastBlockNumber[agent] = currentBlock;
        }

        // Increment and check
        callsInBlock[agent]++;
        currentCallCount = callsInBlock[agent];

        if (currentCallCount <= maxCallsPerBlock) {
            emit RateLimitCheckPassed(agent, currentBlock, currentCallCount);
            return (true, currentCallCount);
        } else {
            emit RateLimitExceeded(agent);
            revert("RL: rate limit exceeded");
        }
    }

    /// @notice View-only check without state modification
    function wouldExceedRateLimit(address agent) external view returns (bool) {
        uint256 currentBlock = block.number;

        // If in a new block, would reset and allow
        if (lastBlockNumber[agent] < currentBlock) {
            return false;
        }

        // Would exceed if adding one more call
        return callsInBlock[agent] + 1 > maxCallsPerBlock;
    }

    /// @notice Get how many calls are left for agent  in current block
    function getRemainingCallsInBlock(address agent) external view returns (uint256) {
        uint256 currentBlock = block.number;

        // If in a new block, reset would allow them full limit
        if (lastBlockNumber[agent] < currentBlock) {
            return maxCallsPerBlock;
        }

        // Otherwise, how many are left
        if (callsInBlock[agent] >= maxCallsPerBlock) {
            return 0;
        }

        return maxCallsPerBlock - callsInBlock[agent];
    }
}
