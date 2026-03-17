// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BudgetPolicy}     from "../policies/BudgetPolicy.sol";
import {MerchantPolicy}   from "../policies/MerchantPolicy.sol";
import {ExpirationPolicy} from "../policies/ExpirationPolicy.sol";
import {AgentBudgetPolicy} from "../policies/AgentBudgetPolicy.sol";

/// @title BaseVaultDeployer
/// @notice Deploys optional policy contracts (merchant, expiration, agent-budget).
///         Split from BaseVaultDeployerCore to keep each contract under 24,576 bytes.
contract BaseVaultDeployer {

    function newMerchantPolicy(address factory, address pe) external returns (address) {
        return address(new MerchantPolicy(factory, pe));
    }

    function newExpirationPolicy(address factory, address pe, uint256 expiry) external returns (address) {
        return address(new ExpirationPolicy(factory, pe, expiry));
    }

    function newAgentBudgetPolicy(
        address factory, address pe,
        BudgetPolicy.Period period, address token
    ) external returns (address) {
        return address(new AgentBudgetPolicy(factory, pe, period, token));
    }
}
