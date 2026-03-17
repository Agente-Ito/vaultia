// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IPolicyEngine {
    function validate(
        address agent,
        address token,
        address to,
        uint256 amount,
        bytes calldata data
    ) external;
}

interface IAgentSafe {
    /// @dev Direct KM path (msg.sender is used as agent identity)
    function agentExecute(
        address payable to,
        uint256 amount,
        bytes calldata data
    ) external;

    function agentTransferToken(
        address token,
        address to,
        uint256 amount,
        bool allowNonLSP1Recipient,
        bytes calldata tokenData
    ) external;

    /// @dev EC path — preserves real agent identity for policy validation / audit
    function agentExecuteFor(
        address agent,
        address payable to,
        uint256 amount,
        bytes calldata data
    ) external;

    function agentTransferTokenFor(
        address agent,
        address token,
        address to,
        uint256 amount,
        bool allowNonLSP1Recipient,
        bytes calldata tokenData
    ) external;
}

interface ILSP7 {
    function balanceOf(address account) external view returns (uint256);
}

/// @title ExecutionController
/// @notice Optional middleware layer for advanced execution control.
///         Provides auditing, rate limiting, and transaction hooks without
///         modifying AgentSafe or PolicyEngine. Vaults can opt-in; existing
///         vaults continue working without changes.
///
///         IMPORTANT: This is OPTIONAL. Vaults wishing to use it must:
///         1. Deploy ExecutionController pointing to their AgentSafe
///         2. Grant ExecutionController permission to call agentExecute/agentTransferToken
///         3. Use KM.execute(ExecutionController.executeWithPolicies(...)) instead of direct AgentSafe.execute()
///
///         Vaults NOT using ExecutionController are unaffected and continue normal operation.
contract ExecutionController is Ownable, ReentrancyGuard {

    // ═════════════════════════════════════════════════════════════════════
    // STATE
    // ═════════════════════════════════════════════════════════════════════

    address public immutable agentSafe;
    address public immutable policyEngine;

    /// @dev Max calls per block per agent (rate limiting)
    uint256 public maxCallsPerBlock = 10;

    /// @dev Per-agent override for max calls per block. 0 means use the global maxCallsPerBlock.
    mapping(address => uint256) public agentMaxCallsPerBlock;

    /// @dev Track calls in current block
    mapping(address => uint256) public callsInBlock;
    mapping(address => uint256) public lastBlockNumber;

    /// @dev Optional: audit hooks for advanced use cases
    address public auditHook;

    /// @dev Singleton helper for safe audit hook invocation — deployed once in constructor.
    AuditHookCaller private immutable _auditHookCaller;

    // ═════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═════════════════════════════════════════════════════════════════════

    event ExecutionStarted(
        address indexed agent,
        address indexed to,
        uint256 amount,
        string paymentType
    );

    event ExecutionCompleted(
        address indexed agent,
        address indexed to,
        uint256 amount,
        string paymentType
    );

    event RateLimitUpdated(uint256 newLimit);
    event AgentMaxCallsSet(address indexed agent, uint256 limit);
    event AuditHookSet(address indexed hook);
    /// @dev Emitted when the audit hook is called but reverts. Execution still proceeds.
    event AuditHookFailed(address indexed hook, address indexed agent, address indexed to, uint256 amount);

    // ═════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═════════════════════════════════════════════════════════════════════

    /// @param initialOwner Factory address (temp owner; transferred to user after setup)
    /// @param _agentSafe   The AgentSafe this controller manages
    /// @param _policyEngine The PolicyEngine to validate against
    constructor(address initialOwner, address _agentSafe, address _policyEngine) {
        require(_agentSafe != address(0), "EC: zero safe");
        require(_policyEngine != address(0), "EC: zero policy");
        agentSafe = _agentSafe;
        policyEngine = _policyEngine;
        _auditHookCaller = new AuditHookCaller();
        _transferOwnership(initialOwner);
    }

    // ═════════════════════════════════════════════════════════════════════
    // RATE LIMITING & CONFIGURATION
    // ═════════════════════════════════════════════════════════════════════

    function setMaxCallsPerBlock(uint256 newLimit) external onlyOwner {
        maxCallsPerBlock = newLimit;
        emit RateLimitUpdated(newLimit);
    }

    /// @notice Set a per-agent call limit for this block. Overrides the global maxCallsPerBlock.
    /// @dev Set to 0 to fall back to the global limit. Useful for high-frequency agents
    ///      (higher limit) or untrusted agents (lower limit) without affecting others.
    function setAgentMaxCallsPerBlock(address agent, uint256 limit) external onlyOwner {
        require(agent != address(0), "EC: zero agent");
        agentMaxCallsPerBlock[agent] = limit;
        emit AgentMaxCallsSet(agent, limit);
    }

    function setAuditHook(address hook) external onlyOwner {
        auditHook = hook;
        emit AuditHookSet(hook);
    }

    // ═════════════════════════════════════════════════════════════════════
    // MAIN EXECUTION METHOD
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Execute native LYX payment with policy validation and rate limiting.
    ///         OPTIONAL: Use this instead of AgentSafe.agentExecute for advanced control.
    ///
    /// @dev Rate-limited to prevent spam. Delegates to AgentSafe.agentExecute which
    ///      handles policy validation internally. ExecutionController provides the
    ///      optional hooks and rate limiting layer on top.
    ///
    /// @param agent  Agent address (should be KeyManager)
    /// @param to     Payment recipient
    /// @param amount LYX amount (wei)
    /// @param data   Calldata forwarded to recipient
    function executeWithPolicies(
        address agent,
        address payable to,
        uint256 amount,
        bytes calldata data
    ) external nonReentrant {
        // Rate limiting
        _checkRateLimit(agent);

        // Audit hook (if configured)
        if (auditHook != address(0)) {
            _callAuditHook(agent, to, amount, "LYX");
        }

        // Emit execution started
        emit ExecutionStarted(agent, to, amount, "LYX");

        // Delegate to AgentSafe.agentExecuteFor — passes real agent address so policies
        // track the actual agent, not ExecutionController (fixes sender identity bug).
        IAgentSafe(agentSafe).agentExecuteFor(agent, to, amount, data);

        // Emit execution completed
        emit ExecutionCompleted(agent, to, amount, "LYX");
    }

    /// @notice Execute LSP7 token transfer with policy validation and rate limiting.
    ///         OPTIONAL: Use this instead of AgentSafe.agentTransferToken for advanced control.
    ///
    /// @param agent                Agent address (should be KeyManager)
    /// @param token                LSP7 token contract
    /// @param to                   Token recipient
    /// @param amount               Token amount
    /// @param allowNonLSP1Recipient See agentTransferToken
    /// @param tokenData            See agentTransferToken
    function executeTokenWithPolicies(
        address agent,
        address token,
        address to,
        uint256 amount,
        bool allowNonLSP1Recipient,
        bytes calldata tokenData
    ) external nonReentrant {
        require(token != address(0), "EC: zero token");

        // Rate limiting
        _checkRateLimit(agent);

        // Audit hook (if configured)
        if (auditHook != address(0)) {
            _callAuditHook(agent, to, amount, "TOKEN");
        }

        // Emit execution started
        emit ExecutionStarted(agent, to, amount, "TOKEN");

        // Delegate to AgentSafe.agentTransferTokenFor — passes real agent address.
        IAgentSafe(agentSafe).agentTransferTokenFor(agent, token, to, amount, allowNonLSP1Recipient, tokenData);

        // Emit execution completed
        emit ExecutionCompleted(agent, to, amount, "TOKEN");
    }

    // ═════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Enforce rate limit: max calls per block per agent
    function _checkRateLimit(address agent) internal {
        uint256 currentBlock = block.number;

        // Reset counter if we're in a new block
        if (lastBlockNumber[agent] < currentBlock) {
            callsInBlock[agent] = 0;
            lastBlockNumber[agent] = currentBlock;
        }

        // Increment and check
        callsInBlock[agent]++;
        // Use per-agent override if set; fall back to global limit
        uint256 limit = agentMaxCallsPerBlock[agent] != 0 ? agentMaxCallsPerBlock[agent] : maxCallsPerBlock;
        require(callsInBlock[agent] <= limit, "EC: rate limit exceeded");
    }

    /// @notice Call audit hook if configured (low-level to avoid reverting on hook failure).
    ///         Emits AuditHookFailed if the hook reverts so operators can detect broken hooks.
    function _callAuditHook(address agent, address to, uint256 amount, string memory paymentType) internal {
        try
            _auditHookCaller.call(auditHook, agent, to, amount, paymentType)
        {} catch {
            // Hook failure must not block execution, but emit an observable event
            // so operators know the audit trail has a gap.
            emit AuditHookFailed(auditHook, agent, to, amount);
        }
    }
}

/// @dev Helper contract for safe audit hook invocation
contract AuditHookCaller {
    function call(address hook, address agent, address to, uint256 amount, string memory paymentType) external {
        (bool success, ) = hook.call(
            abi.encodeWithSignature(
                "onExecution(address,address,uint256,string)",
                agent,
                to,
                amount,
                paymentType
            )
        );
        require(success, "EC: audit hook failed");
    }
}
