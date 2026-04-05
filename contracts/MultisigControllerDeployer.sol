// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MultisigController} from "./MultisigController.sol";

/// @title MultisigControllerDeployer
/// @notice Deploys MultisigController instances. Isolated so that AgentVaultRegistry
///         embeds no creation bytecode and stays under EIP-170's 24,576-byte limit.
/// @dev Unrestricted — the registry is responsible for passing correct parameters.
contract MultisigControllerDeployer {

    function newMultisigController(
        address vault,
        address keyManager,
        address[] memory signers,
        uint256 threshold,
        uint256 timeLock
    ) external returns (address) {
        return address(new MultisigController(vault, keyManager, signers, threshold, timeLock));
    }
}
