// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BudgetPolicy} from "./policies/BudgetPolicy.sol";
import {MerchantPolicy} from "./policies/MerchantPolicy.sol";
import {ExpirationPolicy} from "./policies/ExpirationPolicy.sol";
import {AgentBudgetPolicy} from "./policies/AgentBudgetPolicy.sol";
import {RecipientBudgetPolicy} from "./policies/RecipientBudgetPolicy.sol";

/// @title AgentVaultOptionalPolicyDeployer
/// @notice Deploys optional user-owned policies for the LUKSO vault stack.
///         Split out from AgentVaultDeployer so each helper stays under the
///         EIP-170 runtime bytecode limit.
/// @dev All functions are unrestricted — the registry (msg.sender) is responsible
///      for passing correct parameters.
contract AgentVaultOptionalPolicyDeployer {
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
}