// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LSP9Vault} from "@lukso/lsp9-contracts/contracts/LSP9Vault.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IPolicyEngine {
    function validate(
        address agent,
        address token,
        address to,
        uint256 amount,
        bytes calldata data
    ) external;
}

/// @dev Minimal LSP7 interface for balance check (FIX #24)
interface ILSP7 {
    function balanceOf(address account) external view returns (uint256);
}

/// @title AgentSafe
/// @notice Thin execution container for AI agent payments. Extends LSP9Vault.
///         All policy validation is delegated to the linked PolicyEngine.
///         Agents MUST call through this safe's LSP6 KeyManager — direct calls are blocked.
///
/// @dev Key design decisions:
///      - `execute()` is overridden so the KM (not owner) can forward calls.
///        KM path calls `_execute()` directly, bypassing the `onlyOwner` guard.
///        All other callers go through `super.execute()` (onlyOwner check preserved).
///      - `_execute()` is internal in LSP9VaultCore — called directly, no self-call gas overhead.
///      - PolicyEngine.validate() is called BEFORE `_execute()` (CEI order correct).
///      - Events emitted AFTER `_execute()` (FIX #27: event only fires on success).
///
/// @dev LSP1 DELEGATE WARNING: LSP9Vault inherits universalReceiver(), which forwards calls to
///      any registered LSP1UniversalReceiverDelegate. If such a delegate is set in ERC725Y storage,
///      incoming LSP7 token transfers will trigger it. Ensure delegates are audited before adding;
///      they can interact with this contract's state and affect policy enforcement flows.
contract AgentSafe is LSP9Vault, ReentrancyGuard {

    address public vaultKeyManager;
    address public policyEngine;
    /// @notice Optional execution controller (e.g. ExecutionController middleware).
    ///         Also authorized to call agentExecute/agentTransferToken.
    address public executionController;

    /// @dev ERC725Y keys for on-chain discoverability (LSP2 schema)
    bytes32 internal constant AVP_POLICY_ENGINE = keccak256("AVP:PolicyEngine");
    bytes32 internal constant AVP_KEY_MANAGER   = keccak256("AVP:KeyManager");

    /// @notice Emitted on a successful native LYX payment via agentExecute
    event AgentPaymentExecuted(
        address indexed keyManager,
        address indexed to,
        uint256 amount
    );

    /// @notice Emitted on a successful LSP7 token payment via agentTransferToken (FIX #21)
    event AgentTokenPaymentExecuted(
        address indexed keyManager,
        address indexed token,
        address indexed to,
        uint256 amount
    );

    /// @notice Emitted when the PolicyEngine is set (FIX #22)
    event PolicyEngineSet(address indexed pe);

    /// @notice Emitted when the ExecutionController is updated or cleared.
    event ExecutionControllerUpdated(address indexed newEC);

    modifier onlyViaKeyManager() {
        require(vaultKeyManager != address(0), "AS: KM not set");
        require(
            msg.sender == vaultKeyManager || msg.sender == executionController,
            "AS: must call via KeyManager"
        );
        _;
    }

    /// @param initialOwner Factory address (temp owner; transferred to user after setup via LSP14)
    constructor(address initialOwner) LSP9Vault(initialOwner) {}

    // ─── One-time setup (factory calls while it is still owner) ──────────────

    /// @notice Link the LSP6 KeyManager to this safe. One-time set.
    function setKeyManager(address km) external onlyOwner {
        require(vaultKeyManager == address(0), "AS: KM already set");
        require(km != address(0), "AS: zero KM");
        vaultKeyManager = km;
        _setData(AVP_KEY_MANAGER, abi.encode(km));
    }

    /// @notice Update or clear the ExecutionController (middleware).
    /// @dev Callable by the owner at any time — allows rotating to an updated EC implementation
    ///      without redeploying the vault. Set to address(0) to remove the EC entirely
    ///      (agents will use direct KM paths only). The new EC must be a deployed contract.
    function setExecutionController(address newEC) external onlyOwner {
        require(newEC == address(0) || newEC.code.length > 0, "AS: EC must be a contract");
        executionController = newEC;
        emit ExecutionControllerUpdated(newEC);
    }

    /// @notice Link the PolicyEngine to this safe. One-time set.
    ///         FIX #15: rejects EOA addresses.
    function setPolicyEngine(address pe) external onlyOwner {
        require(policyEngine == address(0), "AS: PE already set");
        require(pe.code.length > 0, "AS: PE must be a contract");
        policyEngine = pe;
        _setData(AVP_POLICY_ENGINE, abi.encode(pe));
        emit PolicyEngineSet(pe);
    }

    // ─── execute() override: KM path with policy validation ─────────────────
    //
    // LSP9VaultCore.execute() has onlyOwner. We override it so the LSP6 KM
    // (not the owner) can also forward calls — which is the standard LUKSO flow.
    //
    // When msg.sender == vaultKeyManager (agent calling through real LSP6 KM):
    //   • Agents use: km.execute(abi.encodeCall(IERC725X.execute, (0, merchant, amount, "")))
    //   • Policies are validated here before _execute()
    //   • Native LYX transfers: token = address(0), to = target, amount = value
    //   • LSP7 token transfers: detected by selector, validated with token address
    //
    // Owner calls go through super.execute() (onlyOwner check preserved).

    /// @dev Computed at compile time: bytes4(keccak256("transfer(address,address,uint256,bool,bytes)"))
    ///      Same value as 0x760d9bba — using the expression makes the derivation auditable
    ///      and guards against future accidental value changes.
    bytes4 private constant LSP7_TRANSFER_SELECTOR =
        bytes4(keccak256("transfer(address,address,uint256,bool,bytes)"));

    function execute(
        uint256 operationType,
        address target,
        uint256 value,
        bytes memory data
    ) public payable override nonReentrant returns (bytes memory) {
        if (msg.sender == vaultKeyManager) {
            require(policyEngine != address(0), "AS: PE not set");

            if (data.length >= 4 && bytes4(data) == LSP7_TRANSFER_SELECTOR && value == 0) {
                // ── Token path: decode LSP7 transfer, validate with actual token address ──
                bytes memory rawParams = new bytes(data.length - 4);
                for (uint256 i = 0; i < data.length - 4; i++) rawParams[i] = data[i + 4];
                (address from, address to, uint256 amount, , bytes memory tokenData) =
                    abi.decode(rawParams, (address, address, uint256, bool, bytes));
                require(from == address(this), "AS: from must be this safe");
                require(target != address(0), "AS: token cannot be zero address");
                // Selector collision guard: only a deployed contract can be an LSP7 token.
                // EOAs and pre-deploy addresses have no code and cannot implement balanceOf.
                require(target.code.length > 0, "AS: token target is not a contract");
                require(ILSP7(target).balanceOf(address(this)) >= amount, "AS: insufficient token balance");
                IPolicyEngine(policyEngine).validate(msg.sender, target, to, amount, tokenData);
                bytes memory tokenResult = _execute(operationType, target, value, data);
                emit AgentTokenPaymentExecuted(msg.sender, target, to, amount);
                return tokenResult;
            } else {
                // ── LYX path: validate with address(0) as token ──────────────────────
                require(address(this).balance >= value, "AS: insufficient LYX balance");
                IPolicyEngine(policyEngine).validate(msg.sender, address(0), target, value, data);
                bytes memory result = _execute(operationType, target, value, data);
                emit AgentPaymentExecuted(msg.sender, target, value);
                return result;
            }
        }
        return super.execute(operationType, target, value, data);
    }

    // ─── Agent Entry: native LYX payment ─────────────────────────────────────

    /// @notice Execute a native LYX payment on behalf of an AI agent.
    ///         Validates against all registered policies before executing.
    /// @param to     Payment destination
    /// @param amount Amount of LYX (in wei)
    /// @param data   Calldata forwarded to recipient
    function agentExecute(
        address payable to,
        uint256 amount,
        bytes calldata data
    ) external nonReentrant onlyViaKeyManager {
        require(address(this).balance >= amount, "AS: insufficient LYX balance"); // FIX #19
        // FIX #8: pass address(0) as token → LYX denomination in BudgetPolicy
        IPolicyEngine(policyEngine).validate(msg.sender, address(0), to, amount, data);
        _execute(0, to, amount, data);
        emit AgentPaymentExecuted(msg.sender, to, amount); // FIX #27: emit AFTER _execute
    }

    // ─── ExecutionController entry points (preserve real agent identity) ─────
    //
    // When ExecutionController calls agentExecute(), msg.sender = EC address.
    // PolicyEngine would attribute the spend to EC, not the real agent —
    // breaking per-agent budgets and audit trails.
    //
    // These variants accept the real agent address explicitly.
    // Only callable by the registered executionController.

    /// @notice LYX payment via ExecutionController, attributing spend to `agent`.
    /// @param agent  The actual AI agent making the payment (for policy validation)
    /// @param to     Payment destination
    /// @param amount Amount of LYX (in wei)
    /// @param data   Calldata forwarded to recipient
    function agentExecuteFor(
        address agent,
        address payable to,
        uint256 amount,
        bytes calldata data
    ) external nonReentrant {
        require(executionController != address(0), "AS: EC not set");
        require(msg.sender == executionController, "AS: only EC");
        require(agent != address(0), "AS: zero agent");
        require(address(this).balance >= amount, "AS: insufficient LYX balance");
        IPolicyEngine(policyEngine).validate(agent, address(0), to, amount, data);
        _execute(0, to, amount, data);
        emit AgentPaymentExecuted(agent, to, amount);
    }

    /// @notice LSP7 token transfer via ExecutionController, attributing spend to `agent`.
    /// @param agent                The actual AI agent making the transfer (for policy validation)
    /// @param token                LSP7 token contract address
    /// @param to                   Token recipient
    /// @param amount               Token amount
    /// @param allowNonLSP1Recipient Forwarded to LSP7.transfer()
    /// @param tokenData            Forwarded to LSP7.transfer()
    function agentTransferTokenFor(
        address agent,
        address token,
        address to,
        uint256 amount,
        bool allowNonLSP1Recipient,
        bytes calldata tokenData
    ) external nonReentrant {
        require(executionController != address(0), "AS: EC not set");
        require(msg.sender == executionController, "AS: only EC");
        require(agent != address(0), "AS: zero agent");
        require(token != address(0), "AS: token cannot be zero address");
        require(ILSP7(token).balanceOf(address(this)) >= amount, "AS: insufficient token balance");
        IPolicyEngine(policyEngine).validate(agent, token, to, amount, tokenData);
        bytes memory transferCall = abi.encodeWithSignature(
            "transfer(address,address,uint256,bool,bytes)",
            address(this),
            to,
            amount,
            allowNonLSP1Recipient,
            tokenData
        );
        _execute(0, token, 0, transferCall);
        emit AgentTokenPaymentExecuted(agent, token, to, amount);
    }

    // ─── Agent Entry: LSP7 token payment ─────────────────────────────────────

    /// @notice Execute an LSP7 token transfer on behalf of an AI agent.
    ///         Validates against all registered policies before executing.
    /// @param token                 LSP7 token contract address (must not be zero — use agentExecute for LYX)
    /// @param to                    Payment destination
    /// @param amount                Token amount (in token units)
    /// @param allowNonLSP1Recipient Forwarded to LSP7.transfer()
    /// @param tokenData             Forwarded to LSP7.transfer()
    function agentTransferToken(
        address token,
        address to,
        uint256 amount,
        bool allowNonLSP1Recipient,
        bytes calldata tokenData
    ) external nonReentrant onlyViaKeyManager {
        require(token != address(0), "AS: token cannot be zero address"); // FIX #16
        // FIX #24: check token balance for a clearer revert message
        require(ILSP7(token).balanceOf(address(this)) >= amount, "AS: insufficient token balance");
        // FIX #8: pass actual token address → denomination enforced in BudgetPolicy
        IPolicyEngine(policyEngine).validate(msg.sender, token, to, amount, tokenData);

        bytes memory transferCall = abi.encodeWithSignature(
            "transfer(address,address,uint256,bool,bytes)",
            address(this),
            to,
            amount,
            allowNonLSP1Recipient,
            tokenData
        );
        _execute(0, token, 0, transferCall);
        emit AgentTokenPaymentExecuted(msg.sender, token, to, amount); // FIX #27: emit AFTER _execute
    }
}
