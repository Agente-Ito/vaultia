// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MerchantRegistry
/// @notice Optional on-chain directory for merchants to self-register with a human-readable name.
///         Used by dApps to display merchant names; not used by any policy contracts.
contract MerchantRegistry {
    mapping(address => string) public merchantNames;
    mapping(address => bool)   public isRegistered;

    event MerchantRegistered(address indexed merchant, string name);
    event MerchantUpdated(address indexed merchant, string name);

    function register(string calldata name) external {
        require(bytes(name).length > 0, "MR: empty name");
        require(bytes(name).length <= 128, "MR: name too long");
        bool wasRegistered = isRegistered[msg.sender];
        merchantNames[msg.sender] = name;
        isRegistered[msg.sender] = true;
        if (wasRegistered) {
            emit MerchantUpdated(msg.sender, name);
        } else {
            emit MerchantRegistered(msg.sender, name);
        }
    }

    function getName(address merchant) external view returns (string memory) {
        return merchantNames[merchant];
    }
}
