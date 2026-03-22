// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {ILSP14Ownable2Step} from "@lukso/lsp14-contracts/contracts/ILSP14Ownable2Step.sol";
import {LSP14Ownable2Step} from "@lukso/lsp14-contracts/contracts/LSP14Ownable2Step.sol";

/// @notice Shared LSP14 + ERC165 ownership base for user-owned protocol contracts.
abstract contract LSP14Ownable2StepInit is LSP14Ownable2Step, ERC165 {
    constructor(address initialOwner) {
        _setOwner(initialOwner);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(ILSP14Ownable2Step).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}