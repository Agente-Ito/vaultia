// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPolicy} from "./IPolicy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MerchantPolicy
/// @notice Enforces a merchant whitelist. Payments to non-whitelisted addresses are blocked.
///         FIX #23: onlyPolicyEngine — consistent caller restriction with BudgetPolicy.
///         FIX #4: merchantList array for UI listing alongside O(1) isMerchant mapping.
///         FIX #5: MAX_MERCHANTS = 200 cap; batch add capped at 100.
contract MerchantPolicy is IPolicy, Ownable {
    /// @dev FIX #23: only the registered PolicyEngine can call validate()
    address public immutable policyEngine;

    mapping(address => bool) public isMerchant;
    /// @dev Compact list of active merchants (kept in sync by add/remove).
    address[] public merchantList;
    /// @dev 0-based position of each merchant in merchantList — enables O(1) swap-and-pop removal.
    ///      Only valid when isMerchant[addr] == true.
    mapping(address => uint256) private _merchantIndex;

    /// @dev FIX #5: list size cap prevents unbounded storage growth
    uint256 public constant MAX_MERCHANTS = 200;

    event MerchantAdded(address indexed merchant);
    event MerchantRemoved(address indexed merchant);
    /// @dev Emitted when addMerchants() skips an already-registered address.
    ///      Skipping (rather than reverting) allows batch calls that may contain duplicates to succeed.
    event MerchantSkipped(address indexed merchant);

    /// @param initialOwner  Factory address (temp owner; transferred to user after setup)
    /// @param _policyEngine The PolicyEngine that calls validate() on this policy
    constructor(address initialOwner, address _policyEngine) {
        require(_policyEngine != address(0), "MP: zero policyEngine");
        policyEngine = _policyEngine;
        _transferOwnership(initialOwner);
    }

    function validate(
        address,
        address, /* token */
        address to,
        uint256,
        bytes calldata
    ) external view override {
        require(msg.sender == policyEngine, "MP: only PolicyEngine");
        require(isMerchant[to], "MP: merchant not whitelisted");
    }

    /// @notice Add one or more merchants. FIX #5: batch capped at 100, total at 200.
    /// @dev Duplicate addresses are silently skipped — not reverted — so batch calls
    ///      containing already-registered merchants succeed. A MerchantSkipped event
    ///      is emitted per duplicate for on-chain transparency.
    function addMerchants(address[] calldata merchants) external onlyOwner {
        require(merchants.length <= 100, "MP: batch too large");
        require(merchantList.length + merchants.length <= MAX_MERCHANTS, "MP: list full");
        for (uint256 i = 0; i < merchants.length; i++) {
            require(merchants[i] != address(0), "MP: zero merchant");
            if (!isMerchant[merchants[i]]) {
                _merchantIndex[merchants[i]] = merchantList.length;
                isMerchant[merchants[i]] = true;
                merchantList.push(merchants[i]);
                emit MerchantAdded(merchants[i]);
            } else {
                emit MerchantSkipped(merchants[i]);
            }
        }
    }

    /// @notice Remove a merchant from the whitelist.
    /// @dev O(1) swap-and-pop using _merchantIndex. Order of merchantList is not preserved.
    function removeMerchant(address merchant) external onlyOwner {
        require(isMerchant[merchant], "MP: not a merchant");
        isMerchant[merchant] = false;

        uint256 idx = _merchantIndex[merchant];
        uint256 lastIdx = merchantList.length - 1;
        if (idx != lastIdx) {
            address last = merchantList[lastIdx];
            merchantList[idx] = last;
            _merchantIndex[last] = idx;
        }
        merchantList.pop();
        delete _merchantIndex[merchant];

        emit MerchantRemoved(merchant);
    }

    /// @notice Returns only active (non-removed) merchants.
    ///         merchantList is kept compact by removeMerchant(), so no off-chain filtering needed.
    function getMerchants() external view returns (address[] memory) {
        return merchantList;
    }
}
