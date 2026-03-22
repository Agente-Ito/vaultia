// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPolicy} from "./policies/IPolicy.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {LSP14Ownable2StepInit} from "./base/LSP14Ownable2StepInit.sol";

/// @title PolicyEngine
/// @notice Executes a chain of IPolicy contracts. All must pass for a payment to proceed.
///         FIX #9: restricted to the linked AgentSafe — prevents external callers
///         from draining BudgetPolicy.spent by calling validate() directly.
///         FIX #17: MAX_POLICIES = 20 prevents gas DoS via unbounded policy loop.
///         Includes a native pause switch so owners can freeze all safe-routed
///         payments without reconfiguring every policy individually.
contract PolicyEngine is LSP14Ownable2StepInit, ReentrancyGuard {
    /// @dev Only the linked AgentSafe can call validate()
    address public immutable safe;

    /// @notice Emergency stop for all validations routed through this engine.
    ///         When paused, every payment routed through the linked safe is blocked.
    bool public paused;

    address[] public policies;
    /// @dev FIX #10: duplicate guard — prevents same policy being added twice
    mapping(address => bool) public isPolicy;
    /// @dev FIX #17: caps total loop iterations in validate()
    uint256 public constant MAX_POLICIES = 20;

    /// @dev Set to true during simulateExecution so stateful policies (BudgetPolicy,
    ///      AgentBudgetPolicy) can skip writing `spent` counters. Resets to false before
    ///      every return path in simulateExecution. Reverts prevent it from getting stuck.
    bool public simulationActive;

    event PolicyAdded(address indexed policy);
    event PolicyRemoved(uint256 indexed index, address indexed policy);
    event PoliciesSwapped(uint256 indexed indexA, uint256 indexed indexB);
    /// @dev FIX #14: includes token so indexers can distinguish LYX vs LSP7 payments
    event Validated(address indexed agent, address indexed token, address indexed to, uint256 amount);
    /// @dev Emitted when a policy blocks an execution during validate()
    event ExecutionBlocked(
        address indexed agent,
        address indexed policy,
        address indexed token,
        address to,
        uint256 amount,
        string reason
    );
    event PauseStatusChanged(bool paused);

    modifier onlySafe() {
        require(msg.sender == safe, "PE: only safe");
        _;
    }

    /// @param initialOwner Factory address (temp owner; transferred to user after setup)
    /// @param _safe        The AgentSafe this engine validates for
    constructor(address initialOwner, address _safe) LSP14Ownable2StepInit(initialOwner) {
        require(_safe != address(0), "PE: zero safe");
        safe = _safe;
    }

    /// @notice Called exclusively by the linked AgentSafe during agentExecute / agentTransferToken.
    ///         Runs every registered policy in sequence — any revert blocks the payment.
    /// @dev Policies MUST be O(1) gas in their validate(). MAX_POLICIES caps total iterations
    ///      but cannot bound per-policy cost — avoid policies with loops or many storage reads.
    function validate(
        address agent,
        address token,
        address to,
        uint256 amount,
        bytes calldata data
    ) external onlySafe {
        require(!paused, "PE: paused");
        uint256 len = policies.length;
        for (uint256 i = 0; i < len; i++) {
            IPolicy(policies[i]).validate(agent, token, to, amount, data);
        }
        emit Validated(agent, token, to, amount);
    }

    /// @notice Add a policy contract to the chain. FIX #10: duplicate check. FIX #17: length cap.
    function addPolicy(address policy) external onlyOwner {
        require(policy != address(0), "PE: zero address");
        require(!isPolicy[policy], "PE: duplicate");
        require(policies.length < MAX_POLICIES, "PE: max policies reached");
        isPolicy[policy] = true;
        policies.push(policy);
        emit PolicyAdded(policy);
    }

    /// @notice Remove a policy by index. Preserves insertion order via shift-left.
    ///         MAX_POLICIES = 20 bounds the loop to O(1) in practice.
    function removePolicy(uint256 index) external onlyOwner {
        require(index < policies.length, "PE: out of bounds");
        address removed = policies[index];
        isPolicy[removed] = false;
        for (uint256 i = index; i < policies.length - 1; ) {
            policies[i] = policies[i + 1];
            unchecked { ++i; }
        }
        policies.pop();
        emit PolicyRemoved(index, removed);
    }

    /// @notice Swaps two policies in the execution order. Use when you need to
    ///         explicitly control which policy validates first.
    function swapPolicies(uint256 indexA, uint256 indexB) external onlyOwner {
        require(
            indexA < policies.length && indexB < policies.length,
            "PE: index out of bounds"
        );
        (policies[indexA], policies[indexB]) = (policies[indexB], policies[indexA]);
        emit PoliciesSwapped(indexA, indexB);
    }

    function getPolicies() external view returns (address[] memory) {
        return policies;
    }

    /// @notice Dry-run validation — previews whether a payment would be blocked.
    ///
    /// @dev USAGE: Always call via eth_call (no gas consumed, no state changes).
    ///      Never call via eth_sendTransaction — this wastes gas and may mutate
    ///      BudgetPolicy.spent if any stateful policy slips through the low-level call.
    ///
    ///      NOT marked `view`: mutates simulationActive so stateful policies can
    ///      detect the dry-run context and skip spent-counter writes.
    ///
    ///      PANIC SAFETY: Uses low-level .call() instead of try/catch so that Solidity
    ///      panics (assert failure, division by zero, array out-of-bounds, etc.) inside
    ///      a policy are caught and treated as a "blocked" result rather than leaving
    ///      simulationActive stuck on true. try/catch does NOT catch panics in Solidity
    ///      ≥0.8 — they propagate as Panic(uint256) errors that bypass the catch block.
    ///
    ///      EMERGENCY: If simulationActive is ever stuck (unexpected proxy edge case),
    ///      the owner can call emergencyResetSimulation() to unblock the function.
    ///
    ///      FRONTEND NOTE: If a simulation transaction fails unexpectedly (e.g. during
    ///      gas estimation), call emergencyResetSimulation() to clear the simulationActive
    ///      flag before retrying. This is a safety valve for edge cases not caught by
    ///      the low-level .call() pattern.
    ///
    ///      Caller restriction: accepts calls from the linked safe OR from any address
    ///      when used as an off-chain preview (eth_call spoofs msg.sender = address(0)).
    ///      On-chain callers that are NOT the safe get a dry-run with no side-effects
    ///      because every policy failure is caught without propagating.
    ///
    /// @param agent    Agent address (typically KeyManager)
    /// @param token    address(0) for native LYX, or LSP7 contract for token
    /// @param to       Payment destination
    /// @param amount   Payment amount (wei for LYX, token units for LSP7)
    /// @param data     Calldata (forwarded to policies)
    /// @return blockingPolicy address(0) if all policies pass, else first blocking policy address
    /// @return reason         Empty string reserved for future detailed revert reasons
    function simulateExecution(
        address agent,
        address token,
        address to,
        uint256 amount,
        bytes calldata data
    ) external nonReentrant returns (address blockingPolicy, string memory reason) {
        if (paused) {
            return (address(this), "PE: paused");
        }
        require(!simulationActive, "PE: simulation reentrant");
        simulationActive = true;

        uint256 len = policies.length;
        bytes memory callData = abi.encodeWithSelector(
            IPolicy.validate.selector,
            agent,
            token,
            to,
            amount,
            data
        );

        for (uint256 i = 0; i < len; i++) {
            address policy = policies[i];

            // Low-level call catches ALL failure modes: revert, panic (assert/div-by-zero/
            // out-of-bounds), and invalid opcode. try/catch would miss panics in ≥0.8.
            // Stateful policies MUST check simulationActive and skip spent accounting
            // to prevent budget drain without a real payment being executed.
            // solhint-disable-next-line avoid-low-level-calls
            (bool success,) = policy.call(callData);
            if (!success) {
                simulationActive = false;
                return (policy, "");
            }
        }

        // All policies passed
        simulationActive = false;
        return (address(0), "");
    }

    /// @notice Emergency reset for simulationActive.
    /// @dev Safety valve: if simulationActive is ever left stuck on true due to an
    ///      unexpected proxy interaction or future Solidity edge case not caught by
    ///      the low-level .call() pattern, the owner can call this to unblock
    ///      simulateExecution. Should never be needed in normal operation.
    function emergencyResetSimulation() external onlyOwner {
        simulationActive = false;
    }

    /// @notice Pause or unpause the policy engine.
    /// @dev This acts as a vault-wide kill switch because every payment must pass through validate().
    function setPaused(bool shouldPause) external onlyOwner {
        paused = shouldPause;
        emit PauseStatusChanged(shouldPause);
    }
}
