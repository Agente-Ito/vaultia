// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AgentVaultRegistry} from "../AgentVaultRegistry.sol";
import {BudgetPolicy} from "../policies/BudgetPolicy.sol";
import {AgentVaultTemplates} from "./AgentVaultTemplates.sol";

/// @title TemplateFactory
/// @notice Creates vaults from preconfigured templates, reducing boilerplate for common use cases.
///         Extends AgentVaultRegistry via composition (optional convenience layer).
///
///         5 Templates:
///         - GROCERY: 100 LYX/week, merchants configurable, 7 days expiry
///         - SUBSCRIPTION: 500 LYX/month, merchants configurable, 365 days expiry
///         - STRATEGY: 1000 LYX/week, no merchants, no expiry
///         - PAYROLL: 10000 LYX/month, per-agent budgets, no expiry
///         - BASIC_TEST: 200 LYX/week, no merchants, no expiry (unit test baseline)
contract TemplateFactory {
    /// @dev Reference to AgentVaultRegistry (deploy separately)
    AgentVaultRegistry public immutable registry;

    /// @notice Template creation parameters with overrides
    struct TemplateParams {
        bytes32 templateId;        // Template ID (e.g., AgentVaultTemplates.GROCERY)
        uint256 customBudget;      // 0 = use template default
        uint256 customExpiration;  // 0 = use template default (or 0 if template has no expiry)
        address[] customMerchants; // empty = use template default
        string customLabel;        // empty = use template default label
    }

    event TemplateApplied(
        bytes32 indexed templateId,
        address indexed owner,
        address indexed safe,
        string label
    );

    error UnknownTemplate(bytes32 templateId);

    /// @param _registry Address of AgentVaultRegistry contract
    constructor(address _registry) {
        require(_registry != address(0), "TF: zero registry");
        registry = AgentVaultRegistry(_registry);
    }

    /// @notice Create a vault from a template with optional overrides.
    /// @param tp TemplateParams with templateId and optional overrides
    /// @param agents Array of agent addresses (must be non-empty if template requires agents)
    /// @param agentBudgets Optional per-agent budgets (must match agents.length if non-empty)
    /// @return record VaultRecord returned from registry.deployVault()
    function createFromTemplate(
        TemplateParams calldata tp,
        address[] calldata agents,
        uint256[] calldata agentBudgets
    ) external returns (AgentVaultRegistry.VaultRecord memory record) {
        // Resolve template to base DeployParams
        AgentVaultRegistry.DeployParams memory dp = _resolveTemplate(tp.templateId);

        // Apply overrides (overrides take precedence over template defaults)
        if (tp.customBudget > 0) {
            dp.budget = tp.customBudget;
        }

        if (tp.customExpiration > 0) {
            dp.expiration = tp.customExpiration;
        }

        if (tp.customMerchants.length > 0) {
            // Clear template defaults and use custom merchants
            dp.merchants = tp.customMerchants;
        }

        if (bytes(tp.customLabel).length > 0) {
            dp.label = tp.customLabel;
        }

        // Validate agents array: no zero addresses, no duplicates
        require(
            agentBudgets.length == 0 || agentBudgets.length == agents.length,
            "TF: agentBudgets length mismatch"
        );
        for (uint256 i = 0; i < agents.length; i++) {
            require(agents[i] != address(0), "TF: zero agent address");
            for (uint256 j = 0; j < i; j++) {
                require(agents[i] != agents[j], "TF: duplicate agent");
            }
        }

        // Set agents and agentBudgets
        dp.agents = agents;
        dp.agentBudgets = agentBudgets;

        // Deploy vault via registry (use deployVaultOnBehalf to register vault under caller's address)
        record = registry.deployVaultOnBehalf(msg.sender, dp);

        // Emit template application event
        emit TemplateApplied(tp.templateId, msg.sender, record.safe, dp.label);
    }

    /// @notice Resolve a template ID to base DeployParams with hard-coded defaults.
    /// @dev All templates use address(0) for budgetToken = native LYX
    /// @param templateId One of AgentVaultTemplates.*
    /// @return dp DeployParams with template defaults (no agents/agentBudgets yet)
    function _resolveTemplate(bytes32 templateId)
        private
        view
        returns (AgentVaultRegistry.DeployParams memory dp)
    {
        // Grocery Vault: Low-value frequent transactions
        // Budget: 100 LYX/week, merchants dynamic, expires in 7 days
        if (templateId == AgentVaultTemplates.GROCERY) {
            dp.budget = 100 ether;
            dp.period = BudgetPolicy.Period.WEEKLY; // Period.WEEKLY = 1
            dp.budgetToken = address(0); // Native LYX
            dp.expiration = block.timestamp + 7 days;
            dp.merchants = new address[](0); // Defaults to empty; caller can override
            dp.label = "Grocery Vault";
            return dp;
        }

        // Subscription Vault: Monthly recurring payments
        // Budget: 500 LYX/month, merchants dynamic, expires in 365 days (auto-renew needed)
        if (templateId == AgentVaultTemplates.SUBSCRIPTION) {
            dp.budget = 500 ether;
            dp.period = BudgetPolicy.Period.MONTHLY; // Period.MONTHLY = 2
            dp.budgetToken = address(0);
            dp.expiration = block.timestamp + 365 days;
            dp.merchants = new address[](0);
            dp.label = "Subscription Vault";
            return dp;
        }

        // Strategy Vault: Autonomous DeFi actions
        // Budget: 1000 LYX/week, no merchants, no expiration
        if (templateId == AgentVaultTemplates.STRATEGY) {
            dp.budget = 1000 ether;
            dp.period = BudgetPolicy.Period.WEEKLY;
            dp.budgetToken = address(0);
            dp.expiration = 0; // No expiration
            dp.merchants = new address[](0);
            dp.label = "Strategy Vault";
            return dp;
        }

        // Payroll Vault: Employee payments with per-agent budgets
        // Budget: 10000 LYX/month, no merchants, no expiration
        // Note: agentBudgets array must be provided by caller (typically [5000, 5000] for 2 employees)
        if (templateId == AgentVaultTemplates.PAYROLL) {
            dp.budget = 10000 ether;
            dp.period = BudgetPolicy.Period.MONTHLY;
            dp.budgetToken = address(0);
            dp.expiration = 0; // No expiration (recurs indefinitely)
            dp.merchants = new address[](0);
            dp.label = "Payroll Vault";
            return dp;
        }

        // Basic Test Vault: Unit testing baseline
        // Budget: 200 LYX/week, no merchants, no expiration
        if (templateId == AgentVaultTemplates.BASIC_TEST) {
            dp.budget = 200 ether;
            dp.period = BudgetPolicy.Period.WEEKLY;
            dp.budgetToken = address(0);
            dp.expiration = 0;
            dp.merchants = new address[](0);
            dp.label = "Test Vault";
            return dp;
        }

        // Unknown template ID
        revert UnknownTemplate(templateId);
    }

    /// @notice View function: get template name by ID
    function getTemplateName(bytes32 templateId) external pure returns (string memory) {
        return AgentVaultTemplates.templateName(templateId);
    }
}
