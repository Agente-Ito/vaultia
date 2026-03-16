// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Minimal interface for re-entry attempt
interface IAgentSafeReentrant {
    function agentTransferToken(
        address token,
        address to,
        uint256 amount,
        bool allowNonLSP1Recipient,
        bytes calldata tokenData
    ) external;
}

/// @title MockReentrantToken
/// @notice Mock LSP7-compatible token that attempts to re-enter AgentSafe.agentTransferToken
///         during its transfer() call. Used to verify nonReentrant protection.
contract MockReentrantToken {
    mapping(address => uint256) private _balances;

    address public targetSafe;
    bool private _attacking;

    function setTarget(address safe) external {
        targetSafe = safe;
    }

    function mint(address to, uint256 amount) external {
        _balances[to] += amount;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /// @dev Called by AgentSafe._execute() → attempts to re-enter on first call
    function transfer(
        address from,
        address to,
        uint256 amount,
        bool allowNonLSP1Recipient,
        bytes calldata
    ) external {
        require(_balances[from] >= amount, "MockToken: insufficient balance");

        if (!_attacking && targetSafe != address(0)) {
            _attacking = true;
            // Attempt re-entry into agentTransferToken — should be blocked by nonReentrant
            IAgentSafeReentrant(targetSafe).agentTransferToken(
                address(this),
                to,
                amount,
                allowNonLSP1Recipient,
                ""
            );
            _attacking = false;
        }

        _balances[from] -= amount;
        _balances[to] += amount;
    }
}
