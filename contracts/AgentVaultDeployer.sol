// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BudgetPolicy} from "./policies/BudgetPolicy.sol";
import {MerchantPolicy} from "./policies/MerchantPolicy.sol";
import {ExpirationPolicy} from "./policies/ExpirationPolicy.sol";
import {AgentBudgetPolicy} from "./policies/AgentBudgetPolicy.sol";
import {RecipientBudgetPolicy} from "./policies/RecipientBudgetPolicy.sol";
import {SharedBudgetPolicy} from "./policies/SharedBudgetPolicy.sol";

/// @title AgentVaultDeployer
/// @notice Deploys BudgetPolicy and optional vault policies (MerchantPolicy,
///         ExpirationPolicy, AgentBudgetPolicy). Isolated so that AgentVaultRegistry
///         embeds no creation bytecode and stays under EIP-170's 24,576-byte limit.
///         LSP6KeyManager deployment is in AgentKMDeployer.
/// @dev All functions are unrestricted — the registry (msg.sender) is responsible
///      for passing correct parameters.
contract AgentVaultDeployer {

    function newBudgetPolicy(
        address factory,
        address pe,
        uint256 budget,
        BudgetPolicy.Period period,
        address token
    ) external returns (address) {
        return address(new BudgetPolicy(factory, pe, budget, period, token));
    }

    function newMerchantPolicy(address factory, address pe) external returns (address) {
        return address(new MerchantPolicy(factory, pe));
    }

    function newExpirationPolicy(
        address factory,
        address pe,
        uint256 expiry
    ) external returns (address) {
        return address(new ExpirationPolicy(factory, pe, expiry));
    }

    function newAgentBudgetPolicy(
        address factory,
        address pe,
        BudgetPolicy.Period period,
        address token
    ) external returns (address) {
        return address(new AgentBudgetPolicy(factory, pe, period, token));
    }

    function newRecipientBudgetPolicy(
        address factory,
        address pe,
        address token
    ) external returns (address) {
        return address(new RecipientBudgetPolicy(factory, pe, token));
    }

    function newSharedBudgetPolicy(
        address factory,
        address pe,
        address pool,
        address vault,
        address token
    ) external returns (address) {
        return address(new SharedBudgetPolicy(factory, pe, pool, vault, token));
    }
}
