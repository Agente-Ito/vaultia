// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPolicy} from "./IPolicy.sol";
import {LSP14Ownable2StepInit} from "../base/LSP14Ownable2StepInit.sol";

/// @title ExpirationPolicy
/// @notice Blocks all payments after a configurable expiration timestamp.
///         expiration == 0 means no expiry (vault never expires).
///         FIX #23: onlyPolicyEngine — consistent with BudgetPolicy and MerchantPolicy.
contract ExpirationPolicy is IPolicy, LSP14Ownable2StepInit {
    /// @dev FIX #23: only the registered PolicyEngine can call validate()
    address public immutable policyEngine;

    /// @notice Unix timestamp after which all payments are blocked. 0 = no expiry.
    uint256 public expiration;

    event ExpirationUpdated(uint256 newExpiration);

    /// @param initialOwner  Factory address (temp owner; transferred to user after setup)
    /// @param _policyEngine The PolicyEngine that calls validate() on this policy
    /// @param _expiration   Unix timestamp, or 0 for no expiry
    constructor(
        address initialOwner,
        address _policyEngine,
        uint256 _expiration
    ) LSP14Ownable2StepInit(initialOwner) {
        require(_policyEngine != address(0), "EP: zero policyEngine");
        require(_expiration == 0 || _expiration > block.timestamp, "EP: expiration in the past");
        policyEngine = _policyEngine;
        expiration = _expiration;
    }

    function validate(
        address,
        address, /* token */
        address,
        uint256,
        bytes calldata
    ) external view override {
        require(msg.sender == policyEngine, "EP: only PolicyEngine");
        require(
            expiration == 0 || block.timestamp < expiration,
            "EP: vault expired"
        );
    }

    /// @notice Update the expiration timestamp.
    /// @dev Setting to 0 removes the expiration entirely — the vault will never expire
    ///      after that call, regardless of what was set before. This power rests solely
    ///      with the vault owner; ensure the owner address is a secure multisig or EOA.
    ///      There is no minimum expiration enforced here — callers can set any future or
    ///      past value (past values cause immediate block of all payments).
    function setExpiration(uint256 _expiration) external onlyOwner {
        expiration = _expiration;
        emit ExpirationUpdated(_expiration);
    }
}
