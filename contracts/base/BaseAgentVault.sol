// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ─── ERC-4337 v0.6 types (inline — no external AA dependency) ────────────────

/// @dev Full UserOperation struct as defined in ERC-4337 v0.6.
///      EntryPoint: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
struct UserOperation {
    address sender;
    uint256 nonce;
    bytes   initCode;
    bytes   callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes   paymasterAndData;
    bytes   signature;
}

interface IAccount {
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData);
}

interface IEntryPoint {
    function getNonce(address sender, uint192 key) external view returns (uint256 nonce);
}

interface IPolicyEngine {
    function validate(
        address agent,
        address token,
        address to,
        uint256 amount,
        bytes calldata data
    ) external;
}

// ─────────────────────────────────────────────────────────────────────────────

/// @title BaseAgentVault
/// @notice EVM smart account vault for Base (and any EVM chain).
///         Holds ERC-20 tokens and native ETH. Authorized agents execute payments
///         subject to policies enforced by a linked PolicyEngine.
///
///         ERC-4337 compliant: the vault owner can manage agents and budgets via
///         UserOperations (signed messages) without switching networks in their wallet.
///         Agents execute payments directly as EOAs — no UserOp overhead for payments.
///
///         Ownership model:
///           owner      = same EOA that controls the LUKSO Universal Profile
///           agents     = authorized spending bots (their own EOAs, pay their own gas)
///           entryPoint = ERC-4337 EntryPoint (for owner management operations)
///
///         Policy model: identical to LUKSO side.
///           PolicyEngine → BudgetPolicy / MultiTokenBudgetPolicy / MerchantPolicy / ExpirationPolicy
///           All existing policy contracts are EVM-pure and deploy on Base unchanged.
///
///         Security: ReentrancyGuard on all execution paths. PolicyEngine.validate()
///         runs before any token transfer (CEI order preserved).
contract BaseAgentVault is IAccount, Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    // ─── ERC-4337 SIG_VALIDATION constants ───────────────────────────────────
    uint256 internal constant SIG_VALIDATION_SUCCESS = 0;
    uint256 internal constant SIG_VALIDATION_FAILED  = 1;

    // ─── Storage ──────────────────────────────────────────────────────────────

    /// @notice ERC-4337 EntryPoint this vault accepts UserOperations from.
    address public immutable entryPoint;

    /// @notice The PolicyEngine that validates payments. Set by factory after deploy.
    address public policyEngine;

    /// @notice Addresses authorized to call executePayment().
    mapping(address => bool) public authorizedAgents;

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @dev Same event name as AgentSafe for frontend indexer compatibility.
    event AgentPaymentExecuted(
        address indexed agent,
        address indexed token,   // address(0) = native ETH
        address indexed to,
        uint256 amount
    );
    event AgentAuthorized(address indexed agent);
    event AgentRevoked(address indexed agent);
    event PolicyEngineSet(address indexed policyEngine);
    event Deposited(address indexed from, address indexed token, uint256 amount);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAgent() {
        require(authorizedAgents[msg.sender], "BAV: not authorized agent");
        _;
    }

    modifier onlyEntryPointOrOwner() {
        require(
            msg.sender == entryPoint || msg.sender == owner(),
            "BAV: only EntryPoint or owner"
        );
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param initialOwner Factory address (temp owner; transferred to user after setup)
    /// @param _entryPoint  ERC-4337 EntryPoint address for this chain
    constructor(address initialOwner, address _entryPoint) {
        require(_entryPoint != address(0), "BAV: zero entryPoint");
        entryPoint = _entryPoint;
        _transferOwnership(initialOwner);
    }

    // ─── ERC-4337 IAccount ────────────────────────────────────────────────────

    /// @notice Called by the EntryPoint to validate a UserOperation signed by owner.
    ///         Returns SIG_VALIDATION_SUCCESS (0) if the signature is valid.
    ///         Prefunds the EntryPoint with missing gas funds if needed.
    /// @dev    The userOpHash already includes chainId and EntryPoint address,
    ///         so signatures are chain-specific and cannot be replayed cross-chain.
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        require(msg.sender == entryPoint, "BAV: only EntryPoint");

        bytes32 msgHash = userOpHash.toEthSignedMessageHash();
        address recovered = msgHash.recover(userOp.signature);
        validationData = (recovered == owner()) ? SIG_VALIDATION_SUCCESS : SIG_VALIDATION_FAILED;

        if (missingAccountFunds > 0) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool ok,) = payable(entryPoint).call{value: missingAccountFunds}("");
            (ok); // prefund failure is non-fatal; EntryPoint will handle it
        }
    }

    // ─── Agent payment execution ──────────────────────────────────────────────

    /// @notice Execute a token payment to a recipient.
    ///         Only authorized agents may call this. Policies enforced by PolicyEngine.
    /// @param token  ERC-20 contract address, or address(0) for native ETH
    /// @param to     Payment recipient
    /// @param amount Token amount (in token decimals) or ETH amount (in wei)
    function executePayment(
        address token,
        address to,
        uint256 amount
    ) external nonReentrant onlyAgent {
        require(policyEngine != address(0), "BAV: policyEngine not set");
        require(to != address(0), "BAV: zero recipient");
        require(amount > 0, "BAV: zero amount");

        // Policy validation — must run before any state change (CEI)
        IPolicyEngine(policyEngine).validate(msg.sender, token, to, amount, "");

        // Execute transfer
        if (token == address(0)) {
            require(address(this).balance >= amount, "BAV: insufficient ETH");
            (bool ok,) = to.call{value: amount}("");
            require(ok, "BAV: ETH transfer failed");
        } else {
            require(
                IERC20(token).transfer(to, amount),
                "BAV: ERC20 transfer failed"
            );
        }

        emit AgentPaymentExecuted(msg.sender, token, to, amount);
    }

    // ─── Owner / EntryPoint execution (for ERC-4337 UserOps) ─────────────────

    /// @notice Execute an arbitrary call. Used by EntryPoint when processing UserOps
    ///         (e.g., addAgent, setBudget, withdraw) — owner never needs to switch networks.
    function execute(
        address dest,
        uint256 value,
        bytes calldata data
    ) external nonReentrant onlyEntryPointOrOwner {
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, bytes memory result) = dest.call{value: value}(data);
        if (!ok) {
            // Bubble up revert reason
            assembly { revert(add(result, 32), mload(result)) }
        }
    }

    /// @notice Execute multiple calls in one UserOperation.
    function executeBatch(
        address[] calldata dests,
        uint256[] calldata values,
        bytes[]   calldata datas
    ) external nonReentrant onlyEntryPointOrOwner {
        require(
            dests.length == values.length && values.length == datas.length,
            "BAV: length mismatch"
        );
        for (uint256 i = 0; i < dests.length; i++) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool ok, bytes memory result) = dests[i].call{value: values[i]}(datas[i]);
            if (!ok) {
                assembly { revert(add(result, 32), mload(result)) }
            }
        }
    }

    // ─── Agent management ─────────────────────────────────────────────────────

    /// @notice Authorize an agent to call executePayment().
    ///         Can be called directly by owner or via UserOp (gasless, no network switch).
    function addAgent(address agent) external onlyOwner {
        require(agent != address(0), "BAV: zero agent");
        require(!authorizedAgents[agent], "BAV: already authorized");
        authorizedAgents[agent] = true;
        emit AgentAuthorized(agent);
    }

    /// @notice Revoke an agent's authorization.
    function removeAgent(address agent) external onlyOwner {
        require(authorizedAgents[agent], "BAV: agent not found");
        authorizedAgents[agent] = false;
        emit AgentRevoked(agent);
    }

    // ─── PolicyEngine management ──────────────────────────────────────────────

    /// @notice Link the PolicyEngine to this vault.
    ///         Called by factory during deployment. Can be updated by owner later
    ///         to upgrade the policy stack without redeploying the vault.
    function setPolicyEngine(address _pe) external onlyOwner {
        require(_pe != address(0), "BAV: zero policyEngine");
        policyEngine = _pe;
        emit PolicyEngineSet(_pe);
    }

    // ─── ERC-4337 nonce helper ────────────────────────────────────────────────

    /// @notice Returns the current nonce for this account from the EntryPoint.
    function getNonce() external view returns (uint256) {
        return IEntryPoint(entryPoint).getNonce(address(this), 0);
    }

    // ─── Token deposit helpers ────────────────────────────────────────────────

    /// @notice Deposit ERC-20 tokens into the vault.
    ///         The caller must have approved this contract for at least `amount`.
    function depositToken(address token, uint256 amount) external {
        require(amount > 0, "BAV: zero amount");
        require(
            IERC20(token).transferFrom(msg.sender, address(this), amount),
            "BAV: transfer failed"
        );
        emit Deposited(msg.sender, token, amount);
    }

    /// @notice Returns the vault's balance for a given token.
    ///         Pass address(0) for native ETH.
    function tokenBalance(address token) external view returns (uint256) {
        if (token == address(0)) return address(this).balance;
        return IERC20(token).balanceOf(address(this));
    }

    /// @notice Withdraw tokens to owner (emergency exit or rebalance).
    function withdraw(address token, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0)) {
            require(address(this).balance >= amount, "BAV: insufficient ETH");
            (bool ok,) = owner().call{value: amount}("");
            require(ok, "BAV: ETH withdraw failed");
        } else {
            require(
                IERC20(token).transfer(owner(), amount),
                "BAV: ERC20 withdraw failed"
            );
        }
    }

    receive() external payable {}
}
