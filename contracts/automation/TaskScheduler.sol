// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title TaskScheduler
/// @notice Manages scheduled and recurring tasks for the AI Financial OS.
/// Supports TIMESTAMP (for subscriptions/payroll) and BLOCK_NUMBER (for DeFi automation) triggers.
/// Keeper-compatible: off-chain services call executeTask() when isExecutable() returns true.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// TRUST MODEL — KEEPER LIVENESS
/// ─────────────────────────────────────────────────────────────────────────────
///
/// TaskScheduler is a PASSIVE on-chain contract. It stores schedules and allows
/// execution when a task's trigger condition is met, but it has NO mechanism to
/// automatically execute tasks or penalize a keeper for being late.
///
/// This design carries the following explicit trust assumptions:
///
///   1. LIVENESS RISK — There is NO on-chain guarantee that tasks execute on time.
///      If the off-chain keeper service is down, congested, or misconfigured, tasks
///      will execute late or not at all. For subscription payments, this means a
///      missed or delayed payment with no automatic retry or penalty.
///
///   2. SINGLE KEEPER = SINGLE POINT OF FAILURE — Operators running only one
///      keeper instance accept the risk that downtime = missed executions.
///      Mitigation: run multiple independent keeper instances (different machines,
///      different operators). With keeperWhitelistEnabled = false, any address can
///      call executeTask(), allowing community/backup keepers.
///
///   3. CATCH-UP BEHAVIOUR — If a keeper is offline for N intervals, only one
///      execution fires when it comes back online (nextExecution += interval once).
///      Past-due intervals are NOT retroactively executed. Systems that require
///      "every payment must run" need external reconciliation logic.
///
///   4. BEST-EFFORT ORDERING — When multiple tasks are due, their execution order
///      depends on the keeper's iteration order over getEligibleTasks(). No
///      on-chain ordering guarantee exists between concurrent eligible tasks.
///
/// These assumptions are acceptable for an AI agent OS operating on a best-effort
/// basis, but MUST be documented for any subscription or payroll operator relying
/// on this contract for time-critical payments.
/// ─────────────────────────────────────────────────────────────────────────────
contract TaskScheduler is Ownable, ReentrancyGuard {

    enum TriggerType { TIMESTAMP, BLOCK_NUMBER }

    struct Task {
        address vault;              // Target vault (AgentSafe)
        address keyManager;         // Vault's LSP6KeyManager
        bytes executeCalldata;      // Encoded km.execute() call
        TriggerType triggerType;    // TIMESTAMP or BLOCK_NUMBER
        uint256 nextExecution;      // Unix timestamp or block number
        uint256 interval;           // Seconds (timestamp) or blocks (block-based)
        bool enabled;               // Is this task active?
        uint256 createdAt;          // When was the task created
    }

    /// @notice Task ID → task data
    mapping(bytes32 => Task) public tasks;

    /// @notice All task IDs (for enumeration)
    bytes32[] public allTaskIds;

    /// @notice Minimum interval for TIMESTAMP-triggered tasks (prevents keeper spam)
    uint256 public constant MIN_TIMESTAMP_INTERVAL = 60; // 1 minute

    /// @notice Keeper whitelist (optional: if configured, only whitelisted keepers can execute)
    mapping(address => bool) public isWhitelistedKeeper;
    bool public keeperWhitelistEnabled;

    // ═════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═════════════════════════════════════════════════════════════════════

    event TaskCreated(
        bytes32 indexed taskId,
        address indexed vault,
        address indexed keyManager,
        TriggerType triggerType,
        uint256 nextExecution,
        uint256 interval
    );

    event TaskExecuted(
        bytes32 indexed taskId,
        uint256 newNextExecution,
        uint256 executedAt
    );

    event TaskEnabled(bytes32 indexed taskId);
    event TaskDisabled(bytes32 indexed taskId);
    event TaskUpdated(bytes32 indexed taskId, uint256 newNextExecution, uint256 newInterval);
    event KeeperWhitelistChanged(bool enabled);
    event KeeperAdded(address indexed keeper);
    event KeeperRemoved(address indexed keeper);

    // ═════════════════════════════════════════════════════════════════════
    // INITIALIZATION & KEEPER MANAGEMENT
    // ═════════════════════════════════════════════════════════════════════

    constructor() {
        keeperWhitelistEnabled = false;  // Default: anyone can execute
    }

    /// @notice Enable/disable keeper whitelist
    function setKeeperWhitelistEnabled(bool enabled) external onlyOwner {
        keeperWhitelistEnabled = enabled;
        emit KeeperWhitelistChanged(enabled);
    }

    /// @notice Add a keeper to whitelist
    function addKeeper(address keeper) external onlyOwner {
        require(keeper != address(0), "TS: invalid keeper");
        isWhitelistedKeeper[keeper] = true;
        emit KeeperAdded(keeper);
    }

    /// @notice Remove a keeper from whitelist
    function removeKeeper(address keeper) external onlyOwner {
        require(keeper != address(0), "TS: invalid keeper");
        isWhitelistedKeeper[keeper] = false;
        emit KeeperRemoved(keeper);
    }

    // ═════════════════════════════════════════════════════════════════════
    // TASK CREATION & MANAGEMENT
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Create a new scheduled task
    /// @param taskId Unique identifier for this task
    /// @param vault Target vault (AgentSafe) address
    /// @param keyManager Vault's LSP6KeyManager address
    /// @param executeCalldata Encoded call to km.execute()
    /// @param triggerType TIMESTAMP or BLOCK_NUMBER
    /// @param nextExecution Unix timestamp or block number (depending on trigger type)
    /// @param interval Seconds (for TIMESTAMP) or blocks (for BLOCK_NUMBER)
    function createTask(
        bytes32 taskId,
        address vault,
        address keyManager,
        bytes calldata executeCalldata,
        TriggerType triggerType,
        uint256 nextExecution,
        uint256 interval
    ) external onlyOwner returns (bytes32) {
        require(taskId != bytes32(0), "TS: invalid taskId");
        require(tasks[taskId].createdAt == 0, "TS: task already exists");
        require(vault != address(0), "TS: invalid vault");
        require(keyManager != address(0), "TS: invalid keyManager");
        require(executeCalldata.length > 0, "TS: empty calldata");
        require(interval > 0, "TS: invalid interval");

        // Validate nextExecution and interval based on trigger type
        if (triggerType == TriggerType.TIMESTAMP) {
            require(nextExecution > 0, "TS: invalid timestamp");
            require(interval >= MIN_TIMESTAMP_INTERVAL, "TS: interval below minimum (60s)");
        } else {
            require(nextExecution > 0, "TS: invalid block number");
        }

        tasks[taskId] = Task({
            vault: vault,
            keyManager: keyManager,
            executeCalldata: executeCalldata,
            triggerType: triggerType,
            nextExecution: nextExecution,
            interval: interval,
            enabled: true,
            createdAt: block.timestamp
        });

        allTaskIds.push(taskId);
        emit TaskCreated(taskId, vault, keyManager, triggerType, nextExecution, interval);

        return taskId;
    }

    /// @notice Enable a task
    function enableTask(bytes32 taskId) external onlyOwner {
        require(tasks[taskId].createdAt != 0, "TS: task not found");
        tasks[taskId].enabled = true;
        emit TaskEnabled(taskId);
    }

    /// @notice Disable a task (can be re-enabled later)
    function disableTask(bytes32 taskId) external onlyOwner {
        require(tasks[taskId].createdAt != 0, "TS: task not found");
        tasks[taskId].enabled = false;
        emit TaskDisabled(taskId);
    }

    /// @notice Update a task's execution time and/or interval
    function updateTask(
        bytes32 taskId,
        uint256 newNextExecution,
        uint256 newInterval
    ) external onlyOwner {
        require(tasks[taskId].createdAt != 0, "TS: task not found");
        require(newNextExecution > 0, "TS: invalid execution");
        require(newInterval > 0, "TS: invalid interval");
        if (tasks[taskId].triggerType == TriggerType.TIMESTAMP) {
            require(newInterval >= MIN_TIMESTAMP_INTERVAL, "TS: interval below minimum (60s)");
        }

        tasks[taskId].nextExecution = newNextExecution;
        tasks[taskId].interval = newInterval;
        emit TaskUpdated(taskId, newNextExecution, newInterval);
    }

    // ═════════════════════════════════════════════════════════════════════
    // TASK EXECUTION
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Check if a task is eligible for execution
    function isExecutable(bytes32 taskId) public view returns (bool) {
        Task storage task = tasks[taskId];
        if (!task.enabled) return false;
        if (task.createdAt == 0) return false;

        if (task.triggerType == TriggerType.TIMESTAMP) {
            return block.timestamp >= task.nextExecution;
        } else if (task.triggerType == TriggerType.BLOCK_NUMBER) {
            return block.number >= task.nextExecution;
        }
        return false;
    }

    /// @notice Execute a task (updates nextExecution and calls KeyManager)
    /// @dev Not payable: keepers do not forward LYX. The vault holds its own LYX balance and
    /// the stored executeCalldata instructs the vault to spend from it. Forwarding msg.value
    /// would allow arbitrary fund injection into the KeyManager.
    function executeTask(bytes32 taskId) external nonReentrant returns (bool success) {
        Task storage task = tasks[taskId];
        require(task.createdAt != 0, "TS: task not found");
        require(task.enabled, "TS: task disabled");

        // Check keeper whitelist if enabled
        if (keeperWhitelistEnabled) {
            require(isWhitelistedKeeper[msg.sender], "TS: keeper not whitelisted");
        }

        // Check if executable
        require(isExecutable(taskId), "TS: not executable yet");

        // Update nextExecution (works for both TIMESTAMP and BLOCK_NUMBER)
        task.nextExecution += task.interval;

        // Execute the KeyManager call — vault funds its own payments from its LYX balance
        (success, ) = task.keyManager.call(task.executeCalldata);
        require(success, "TS: execution failed");

        emit TaskExecuted(taskId, task.nextExecution, block.timestamp);
    }

    // ═════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Get task data
    function getTask(bytes32 taskId)
        external
        view
        returns (
            address vault,
            address keyManager,
            bytes memory executeCalldata,
            TriggerType triggerType,
            uint256 nextExecution,
            uint256 interval,
            bool enabled,
            uint256 createdAt
        )
    {
        Task storage task = tasks[taskId];
        require(task.createdAt != 0, "TS: task not found");

        return (
            task.vault,
            task.keyManager,
            task.executeCalldata,
            task.triggerType,
            task.nextExecution,
            task.interval,
            task.enabled,
            task.createdAt
        );
    }

    /// @notice Get all task IDs
    function getTaskCount() external view returns (uint256) {
        return allTaskIds.length;
    }

    /// @notice Get task IDs (paginated)
    function getTaskIds(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory)
    {
        require(offset < allTaskIds.length || allTaskIds.length == 0, "TS: invalid offset");

        uint256 actualLimit = limit;
        if (offset + limit > allTaskIds.length) {
            actualLimit = allTaskIds.length - offset;
        }

        bytes32[] memory result = new bytes32[](actualLimit);
        for (uint i = 0; i < actualLimit; i++) {
            result[i] = allTaskIds[offset + i];
        }
        return result;
    }

    /// @notice Get all eligible tasks (for off-chain keeper services)
    /// Returns only enabled, executable tasks
    function getEligibleTasks() external view returns (bytes32[] memory) {
        bytes32[] memory temp = new bytes32[](allTaskIds.length);
        uint256 count = 0;

        for (uint i = 0; i < allTaskIds.length; i++) {
            if (isExecutable(allTaskIds[i])) {
                temp[count] = allTaskIds[i];
                count++;
            }
        }

        // Trim array
        bytes32[] memory result = new bytes32[](count);
        for (uint i = 0; i < count; i++) {
            result[i] = temp[i];
        }
        return result;
    }

    /// @notice Get tasks for a specific vault
    function getTasksForVault(address vault)
        external
        view
        returns (bytes32[] memory)
    {
        require(vault != address(0), "TS: invalid vault");

        bytes32[] memory temp = new bytes32[](allTaskIds.length);
        uint256 count = 0;

        for (uint i = 0; i < allTaskIds.length; i++) {
            if (tasks[allTaskIds[i]].vault == vault) {
                temp[count] = allTaskIds[i];
                count++;
            }
        }

        // Trim array
        bytes32[] memory result = new bytes32[](count);
        for (uint i = 0; i < count; i++) {
            result[i] = temp[i];
        }
        return result;
    }

    /// @notice Get time until task is executable (TIMESTAMP tasks only)
    function getTimeUntilExecutable(bytes32 taskId)
        external
        view
        returns (int256)
    {
        Task storage task = tasks[taskId];
        require(task.createdAt != 0, "TS: task not found");
        require(task.triggerType == TriggerType.TIMESTAMP, "TS: not a timestamp task");

        if (block.timestamp >= task.nextExecution) {
            return 0;
        }
        return int256(task.nextExecution - block.timestamp);
    }

    /// @notice Get blocks until task is executable (BLOCK_NUMBER tasks only)
    function getBlocksUntilExecutable(bytes32 taskId)
        external
        view
        returns (int256)
    {
        Task storage task = tasks[taskId];
        require(task.createdAt != 0, "TS: task not found");
        require(task.triggerType == TriggerType.BLOCK_NUMBER, "TS: not a block task");

        if (block.number >= task.nextExecution) {
            return 0;
        }
        return int256(task.nextExecution - block.number);
    }
}
