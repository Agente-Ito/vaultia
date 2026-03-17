// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseAgentVault}   from "./BaseAgentVault.sol";
import {PolicyEngine}     from "../PolicyEngine.sol";
import {BudgetPolicy}     from "../policies/BudgetPolicy.sol";
import {MultiTokenBudgetPolicy} from "./policies/MultiTokenBudgetPolicy.sol";

/// @title BaseVaultDeployerCore
/// @notice Deploys vault + policy engine + budget policies.
///         Split from BaseVaultDeployer to keep each contract under 24,576 bytes.
contract BaseVaultDeployerCore {

    function newVault(address factory, address entryPoint) external returns (address) {
        return address(new BaseAgentVault(factory, entryPoint));
    }

    function newPolicyEngine(address factory, address vault) external returns (address) {
        return address(new PolicyEngine(factory, vault));
    }

    function newBudgetPolicy(
        address factory, address pe,
        uint256 budget, BudgetPolicy.Period period, address token
    ) external returns (address) {
        return address(new BudgetPolicy(factory, pe, budget, period, token));
    }

    function newMultiTokenBudgetPolicy(address factory, address pe) external returns (address) {
        return address(new MultiTokenBudgetPolicy(factory, pe));
    }
}
