// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPolicy} from "./policies/IPolicy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PolicyEngine
/// @notice Executes a chain of IPolicy contracts. All must pass for a payment to proceed.
///         FIX #9: restricted to the linked AgentSafe — prevents external callers
///         from draining BudgetPolicy.spent by calling validate() directly.
///         FIX #17: MAX_POLICIES = 20 prevents gas DoS via unbounded policy loop.
contract PolicyEngine is Ownable {
    /// @dev Only the linked AgentSafe can call validate()
    address public immutable safe;

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

    modifier onlySafe() {
        require(msg.sender == safe, "PE: only safe");
        _;
    }

    /// @param initialOwner Factory address (temp owner; transferred to user after setup)
    /// @param _safe        The AgentSafe this engine validates for
    constructor(address initialOwner, address _safe) {
        require(_safe != address(0), "PE: zero safe");
        safe = _safe;
        _transferOwnership(initialOwner);
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

    /// @notice Remove a policy by index using swap-and-pop.
    /// @dev WARNING: swap-and-pop does NOT preserve insertion order.
    ///      Policy execution order is NOT guaranteed after removal.
    ///      Do not build logic that depends on policy order.
    function removePolicy(uint256 index) external onlyOwner {
        require(index < policies.length, "PE: out of bounds");
        address removed = policies[index];
        isPolicy[removed] = false;
        policies[index] = policies[policies.length - 1];
        policies.pop();
        emit PolicyRemoved(index, removed);
    }

    function getPolicies() external view returns (address[] memory) {
        return policies;
    }

    /// @notice Dry-run validation — previews whether a payment would be blocked.
    ///
    /// @dev USAGE: Always call via eth_call (no gas consumed, no state changes).
    ///      Never call via eth_sendTransaction — this wastes gas and may mutate
    ///      BudgetPolicy.spent if any stateful policy slips through the try-catch.
    ///
    ///      NOT marked `view`: Solidity ≤0.8.20 disallows try-catch in view functions.
    ///      Caller restriction: accepts calls from the linked safe OR from any address
    ///      when used as an off-chain preview (eth_call spoofs msg.sender = address(0)).
    ///      On-chain callers that are NOT the safe get a dry-run with no side-effects
    ///      because every policy revert is caught without propagating.
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
    ) external returns (address blockingPolicy, string memory reason) {
        require(!simulationActive, "PE: simulation reentrant");
        simulationActive = true;

        uint256 len = policies.length;

        for (uint256 i = 0; i < len; i++) {
            address policy = policies[i];

            // Try to invoke policy.validate(...) safely.
            // Stateful policies MUST check simulationActive and skip spent accounting
            // to prevent budget drain without a real payment being executed.
            try IPolicy(policy).validate(agent, token, to, amount, data) {
                // Policy passed, continue to next
            } catch {
                simulationActive = false; // reset before early return
                return (policy, "");
            }
        }

        // All policies passed
        simulationActive = false;
        return (address(0), "");
    }
}
