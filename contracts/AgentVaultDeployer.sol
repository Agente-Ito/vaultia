// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BudgetPolicy} from "./policies/BudgetPolicy.sol";

/// @title AgentVaultDeployer
/// @notice Deploys the base vault policy that every stack needs.
///         Optional policy creation is delegated to AgentVaultOptionalPolicyDeployer
///         to keep each helper under EIP-170's 24,576-byte runtime limit.
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
}
