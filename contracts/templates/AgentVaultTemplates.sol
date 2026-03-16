// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AgentVaultTemplates
/// @notice Library of template constants for common vault use cases.
///         Provides Period enums and template IDs for gas-efficient, type-safe template selection.
library AgentVaultTemplates {
    // Budget reset periods (from BudgetPolicy)
    uint256 internal constant DAILY = 0;
    uint256 internal constant WEEKLY = 1;
    uint256 internal constant MONTHLY = 2;
    uint256 internal constant YEARLY = 3;

    // Template identifiers (bytes32 for efficient keying)
    bytes32 internal constant GROCERY = keccak256("TEMPLATE_GROCERY");
    bytes32 internal constant SUBSCRIPTION = keccak256("TEMPLATE_SUBSCRIPTION");
    bytes32 internal constant STRATEGY = keccak256("TEMPLATE_STRATEGY");
    bytes32 internal constant PAYROLL = keccak256("TEMPLATE_PAYROLL");
    bytes32 internal constant BASIC_TEST = keccak256("TEMPLATE_BASIC_TEST");

    /// @notice Descriptive names for each template
    function templateName(bytes32 templateId) internal pure returns (string memory) {
        if (templateId == GROCERY) return "Grocery Vault";
        if (templateId == SUBSCRIPTION) return "Subscription Vault";
        if (templateId == STRATEGY) return "Strategy Vault";
        if (templateId == PAYROLL) return "Payroll Vault";
        if (templateId == BASIC_TEST) return "Test Vault";
        return "Unknown Template";
    }
}
