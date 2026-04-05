// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @dev Minimal LSP6 KeyManager interface.
interface ILSP6KeyManager {
    function execute(bytes calldata payload) external payable returns (bytes memory);
}

/// @dev Minimal ERC725X interface — used to build the execute() payload.
interface IERC725X {
    function execute(
        uint256 operationType,
        address target,
        uint256 value,
        bytes calldata data
    ) external payable returns (bytes memory);
}

/// @dev Minimal ownership interface — reads the current owner of the vault on-the-fly.
interface IOwnable {
    function owner() external view returns (address);
}

// ─── Errors ────────────────────────────────────────────────────────────────────

error NotSigner();
error AlreadyApproved();
error NotApproved();
error NotProposer();
error NotPending();
error DeadlineExpired();
error TimelockPending(uint256 unlockAt);
error QuorumNotReached();
error NotExecutor();
error InvalidThreshold();
error DuplicateSigner();
error ZeroAddress();
error OnlySelf();
error NotVault();
error ProposalExists();
error IntentHashMismatch();

/// @title MultisigController
/// @notice On-chain M-of-N multisig acting as the sole LSP6 KeyManager controller for an
///         AgentVault. All vault actions must pass through a 2-step Propose → Approve → Execute
///         flow. Supports optional per-proposal timelocks, configurable executor modes,
///         signer rotation, and threshold changes — all gated by the M-of-N rule itself.
///
/// @dev Security properties:
///      - intentHash covers chainId + vault + keyManager + nonce + all proposal params.
///        A nonce advance invalidates any prior hash for the same params, preventing replay.
///      - execute() revalidates intentHash on-the-fly; if vault/KM changes between proposal
///        and execution, the hash will not match and the call reverts.
///      - Status is set to EXECUTED before the external call (Checks-Effects-Interactions).
///      - nonReentrant guards execute() against re-entrant vault callbacks.
///      - updateSigners/updateTimelock are only callable via execute() + selfCall()
///        with an approved self-targeted proposal (see selfCall() below).
///      - selfCall() lets the MS call itself through the vault→KM→Vault chain:
///        propose(msAddr, 0, updateSignersData) → approve → execute → selfCall → updateSigners.
///        msg.sender inside selfCall = vault, which is the accepted caller; selfCall then
///        does address(this).call(data) so msg.sender inside updateSigners = address(ms).
///      - MultisigController is granted SUPER_CALL | SUPER_TRANSFERVALUE (PERM_POWER_USER
///        = 0x500) in LSP6. The M-of-N flow + PolicyEngine enforce spend restrictions.
contract MultisigController is ReentrancyGuard {

    // ─── Enums ────────────────────────────────────────────────────────────────

    enum ExecutorMode {
        ONLY_OWNER, // msg.sender must be LSP9Vault.owner() at execution time
        ANY_SIGNER  // msg.sender must be any registered signer
    }

    enum ProposalStatus {
        PENDING,
        EXECUTED,
        CANCELLED
    }

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Proposal {
        address        proposer;
        address        target;
        uint256        value;
        bytes          data;
        uint256        deadline;          // 0 = no expiry
        uint256        timelockEnd;       // absolute timestamp when execution unlocks
        uint256        timelockOverride;  // stored for intentHash revalidation in execute()
        ExecutorMode   executorMode;
        bytes32        intentHash;
        uint256        proposalNonce;     // nonce consumed when computing intentHash
        uint256        approvalCount;
        ProposalStatus status;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    address public vault;
    address public keyManager;

    address[] public signers;
    mapping(address => bool) public isSigner;

    uint256 public threshold;
    uint256 public timeLock; // global default delay in seconds

    uint256 public nonce;

    /// @notice All proposals, keyed by their deterministic id.
    mapping(bytes32 => Proposal) public proposals;

    /// @notice Per-proposal per-signer approval state (separated from struct for legibility).
    mapping(bytes32 => mapping(address => bool)) public approved;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Proposed(
        bytes32 indexed id,
        address indexed proposer,
        address target,
        uint256 value,
        uint256 deadline,
        uint256 timelockEnd,      // absolute timestamp when execution unlocks (0 if no timelock)
        ExecutorMode executorMode
    );
    event Approved(bytes32 indexed id, address indexed signer);
    event Unapproved(bytes32 indexed id, address indexed signer);
    event Revoked(bytes32 indexed id, address indexed proposer);
    event Executed(bytes32 indexed id, address indexed executor);
    event Cancelled(bytes32 indexed id, address indexed who);
    event SignersUpdated(address[] newSigners);
    event ThresholdUpdated(uint256 newThreshold);
    event TimelockUpdated(uint256 newDelay);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlySelf() {
        if (msg.sender != address(this)) revert OnlySelf();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _vault      Address of the AgentSafe (LSP9Vault) this controller manages.
    /// @param _keyManager Address of the LSP6KeyManager set on the vault.
    /// @param _signers    Initial list of signers (no duplicates, no zero addresses).
    /// @param _threshold  Minimum approvals required (1 <= threshold <= signers.length).
    /// @param _timeLock   Global default timelock delay in seconds (0 = no delay).
    constructor(
        address _vault,
        address _keyManager,
        address[] memory _signers,
        uint256 _threshold,
        uint256 _timeLock
    ) {
        if (_vault == address(0) || _keyManager == address(0)) revert ZeroAddress();
        _validateAndSetSigners(_signers, _threshold);
        vault      = _vault;
        keyManager = _keyManager;
        timeLock   = _timeLock;
        emit TimelockUpdated(_timeLock);
    }

    // ─── Core flow ────────────────────────────────────────────────────────────

    /// @notice Propose a new vault action. The proposer is automatically approved.
    /// @param target          Target address for the vault execute() call.
    /// @param value           Native value (LYX) to forward.
    /// @param data            Calldata to forward.
    /// @param deadline        Unix timestamp after which this proposal cannot be approved/executed.
    ///                        Pass 0 for no expiry.
    /// @param timelockOverride Per-proposal timelock override in seconds.
    ///                        If > global timeLock, this value is used; otherwise global is used.
    /// @param executorMode    Who can call execute(): ONLY_OWNER or ANY_SIGNER.
    /// @return id             Deterministic proposal ID = keccak256(intentHash).
    function propose(
        address     target,
        uint256     value,
        bytes calldata data,
        uint256     deadline,
        uint256     timelockOverride,
        ExecutorMode executorMode
    ) external returns (bytes32 id) {
        if (!isSigner[msg.sender]) revert NotSigner();
        if (deadline != 0 && block.timestamp >= deadline) revert DeadlineExpired();

        uint256 currentNonce = nonce++;
        uint256 effectiveTimelock = timelockOverride > timeLock ? timelockOverride : timeLock;

        bytes32 intentHash = _computeIntentHash(
            currentNonce,
            target,
            value,
            data,
            uint8(executorMode),
            deadline,
            timelockOverride
        );

        id = keccak256(abi.encode(intentHash));

        // Should not collide given the nonce, but guard defensively.
        if (proposals[id].proposer != address(0)) revert ProposalExists();

        proposals[id] = Proposal({
            proposer:         msg.sender,
            target:           target,
            value:            value,
            data:             data,
            deadline:         deadline,
            timelockEnd:      block.timestamp + effectiveTimelock,
            timelockOverride: timelockOverride,
            executorMode:     executorMode,
            intentHash:       intentHash,
            proposalNonce:    currentNonce,
            approvalCount:    0,
            status:           ProposalStatus.PENDING
        });

        // Auto-approve for the proposer.
        _grantApproval(id, msg.sender);

        emit Proposed(id, msg.sender, target, value, deadline, proposals[id].timelockEnd, executorMode);
    }

    /// @notice Approve a pending proposal.
    function approve(bytes32 id) external {
        if (!isSigner[msg.sender]) revert NotSigner();
        Proposal storage p = proposals[id];
        if (p.status != ProposalStatus.PENDING) revert NotPending();
        if (p.deadline != 0 && block.timestamp >= p.deadline) revert DeadlineExpired();
        if (approved[id][msg.sender]) revert AlreadyApproved();
        _grantApproval(id, msg.sender);
    }

    /// @notice Retract a previously given approval. Useful to lower the count before execution.
    function unapprove(bytes32 id) external {
        if (!isSigner[msg.sender]) revert NotSigner();
        Proposal storage p = proposals[id];
        if (p.status != ProposalStatus.PENDING) revert NotPending();
        if (p.deadline != 0 && block.timestamp >= p.deadline) revert DeadlineExpired();
        if (!approved[id][msg.sender]) revert NotApproved();
        approved[id][msg.sender] = false;
        p.approvalCount--;
        emit Unapproved(id, msg.sender);
    }

    /// @notice Cancel a pending proposal. Only the original proposer can do this.
    function revoke(bytes32 id) external {
        Proposal storage p = proposals[id];
        if (p.status != ProposalStatus.PENDING) revert NotPending();
        if (p.proposer != msg.sender) revert NotProposer();
        p.status = ProposalStatus.CANCELLED;
        emit Revoked(id, msg.sender);
        emit Cancelled(id, msg.sender);
    }

    /// @notice Execute an approved proposal once quorum and timelock are satisfied.
    /// @dev    Follows Checks-Effects-Interactions: status is EXECUTED *before* the
    ///         external call to prevent re-entrancy exploits even if target re-enters.
    function execute(bytes32 id) external nonReentrant {
        Proposal storage p = proposals[id];

        // ── Checks ────────────────────────────────────────────────────────────
        if (p.status != ProposalStatus.PENDING) revert NotPending();
        if (p.deadline != 0 && block.timestamp >= p.deadline) revert DeadlineExpired();
        if (block.timestamp < p.timelockEnd) revert TimelockPending(p.timelockEnd);
        if (p.approvalCount < threshold) revert QuorumNotReached();

        // Revalidate intentHash: if vault or keyManager changed after proposal was created,
        // recomputing with current storage addresses produces a different hash → revert.
        bytes32 freshHash = _computeIntentHash(
            p.proposalNonce,
            p.target,
            p.value,
            p.data,
            uint8(p.executorMode),
            p.deadline,
            p.timelockOverride
        );
        if (freshHash != p.intentHash) revert IntentHashMismatch();

        // Executor mode check.
        if (p.executorMode == ExecutorMode.ONLY_OWNER) {
            if (msg.sender != IOwnable(vault).owner()) revert NotExecutor();
        } else {
            if (!isSigner[msg.sender]) revert NotExecutor();
        }

        // ── Effects ───────────────────────────────────────────────────────────
        p.status = ProposalStatus.EXECUTED;

        // ── Interactions ──────────────────────────────────────────────────────
        // Build the ERC725X.execute() calldata and forward it through the KeyManager.
        bytes memory payload = abi.encodeWithSelector(
            IERC725X.execute.selector,
            uint256(0), // operationType = CALL
            p.target,
            p.value,
            p.data
        );
        ILSP6KeyManager(keyManager).execute{value: 0}(payload);

        emit Executed(id, msg.sender);
    }

    // ─── Admin (onlySelf — must be called via an approved proposal) ───────────

    /// @notice Replace the signer set and threshold. Must go through a multisig proposal.
    function updateSigners(address[] calldata newSigners, uint256 newThreshold) external onlySelf {
        _validateAndSetSigners(newSigners, newThreshold);
    }

    /// @notice Update the global default timelock delay. Must go through a multisig proposal.
    function updateTimelock(uint256 newDelay) external onlySelf {
        timeLock = newDelay;
        emit TimelockUpdated(newDelay);
    }

    /// @notice Bounce-call: lets the MS invoke onlySelf functions (updateSigners,
    ///         updateTimelock) through an approved proposal that targets this contract.
    ///
    /// @dev    Call chain for signer rotation:
    ///           propose(msAddr, 0, updateSignersCalldata)
    ///           → approve (threshold reached)
    ///           → execute()
    ///             → KM.execute(Vault.execute(msAddr, selfCallData))
    ///               → ms.selfCall(updateSignersCalldata)   ← msg.sender = vault ✓
    ///                 → address(ms).call(updateSignersCalldata)
    ///                   → ms.updateSigners(...)            ← msg.sender = address(ms) ✓
    ///
    ///         Only the vault can reach this entry point (enforced by NotVault guard).
    ///         The outer execute() already enforces quorum + timelock + intentHash.
    ///         nonReentrant is inherited from execute() — NOT re-applied here because
    ///         selfCall is only reachable FROM execute(), which already holds the lock.
    function selfCall(bytes calldata data) external {
        if (msg.sender != vault) revert NotVault();
        (bool ok, bytes memory ret) = address(this).call(data);
        if (!ok) {
            assembly { revert(add(ret, 32), mload(ret)) }
        }
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// @notice Returns the full signers list.
    function getSigners() external view returns (address[] memory) {
        return signers;
    }

    /// @notice Returns true if the proposal has reached the current threshold.
    function hasQuorum(bytes32 id) external view returns (bool) {
        return proposals[id].approvalCount >= threshold;
    }

    /// @notice Off-chain preview: returns the intentHash and proposal id for a given set of
    ///         parameters using the current vault/KM addresses and nonce.
    function previewIntentHash(
        address      target,
        uint256      value,
        bytes calldata data,
        uint8        executorMode,
        uint256      deadline,
        uint256      timelockOverride
    ) external view returns (bytes32 hash, bytes32 id, uint256 currentNonce) {
        currentNonce = nonce;
        hash = _computeIntentHash(currentNonce, target, value, data, executorMode, deadline, timelockOverride);
        id   = keccak256(abi.encode(hash));
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function _grantApproval(bytes32 id, address signer) internal {
        approved[id][signer] = true;
        proposals[id].approvalCount++;
        emit Approved(id, signer);
    }

    /// @notice Builds the canonical intentHash for a new proposal.
    /// @dev    Binds: chainId, vault, keyManager (migration protection), nonce (replay protection),
    ///         target, value, data, executorMode, deadline, timelockOverride (context protection).
    function _computeIntentHash(
        uint256 _nonce,
        address target,
        uint256 value,
        bytes memory data,
        uint8 executorMode,
        uint256 deadline,
        uint256 timelockOverride
    ) internal view returns (bytes32) {
        return keccak256(abi.encode(
            block.chainid,
            vault,
            keyManager,
            _nonce,
            target,
            value,
            keccak256(data),
            executorMode,
            deadline,
            timelockOverride
        ));
    }

    /// @notice Validates a new signer set and replaces the current one atomically.
    function _validateAndSetSigners(address[] memory newSigners, uint256 newThreshold) internal {
        if (newThreshold == 0 || newThreshold > newSigners.length) revert InvalidThreshold();

        // Wipe current set.
        for (uint256 i = 0; i < signers.length; i++) {
            isSigner[signers[i]] = false;
        }
        delete signers;

        // Populate new set (reject zero addresses and duplicates).
        for (uint256 i = 0; i < newSigners.length; i++) {
            address s = newSigners[i];
            if (s == address(0)) revert ZeroAddress();
            if (isSigner[s]) revert DuplicateSigner();
            isSigner[s] = true;
            signers.push(s);
        }

        threshold = newThreshold;
        emit SignersUpdated(newSigners);
        emit ThresholdUpdated(newThreshold);
    }
}
