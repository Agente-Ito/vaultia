// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Minimal contract that can serve as a signer in MultisigController tests.
///      Simulates a Universal Profile or other contract-based signer whose address
///      is included in the signer list.  The actual approval is done by sending a
///      transaction from this contract's address (impersonated in tests).
contract MockContractSigner {
    // No state needed — the address itself is what the test cares about.
}
