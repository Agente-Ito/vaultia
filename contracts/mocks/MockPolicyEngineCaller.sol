// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPolicy} from "../policies/IPolicy.sol";

contract MockPolicyEngineCaller {
    bool private _simulationActive;

    function simulationActive() external view returns (bool) {
        return _simulationActive;
    }

    function setSimulationActive(bool active) external {
        _simulationActive = active;
    }

    function callValidate(
        address policy,
        address agent,
        address token,
        address to,
        uint256 amount,
        bytes calldata data
    ) external {
        IPolicy(policy).validate(agent, token, to, amount, data);
    }
}