// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IPolicy
/// @notice Interface that all policy contracts must implement.
///         Called by PolicyEngine during validate(). Revert to block a payment.
interface IPolicy {
    /// @notice Validate a proposed payment. Revert if the policy is violated.
    /// @param agent  The caller address in AgentSafe (= vault's KeyManager address)
    /// @param token  address(0) for native LYX; LSP7 contract address for token payments
    /// @param to     Payment destination
    /// @param amount Payment amount (wei for LYX; token units for LSP7)
    /// @param data   Calldata (for future policies that inspect payload)
    function validate(
        address agent,
        address token,
        address to,
        uint256 amount,
        bytes calldata data
    ) external;
}
