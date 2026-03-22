// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockOwnedVault {
    address public owner;

    constructor(address initialOwner) {
        owner = initialOwner;
    }

    function setOwner(address newOwner) external {
        require(msg.sender == owner, "MockOwnedVault: not owner");
        owner = newOwner;
    }
}