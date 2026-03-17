// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title SharedBudgetPool
/// @notice Manages nested, hierarchical budget pools for multi-vault financial coordination.
/// Supports DAG structure (parent pointers only, no recursion) with max depth 4.
///
/// FIX #25: ReentrancyGuard on recordSpend() prevents race conditions if AuthorizedPolicy
///          is itself a complex contract with external callbacks.
contract SharedBudgetPool is Ownable, ReentrancyGuard {

    enum Period { DAILY, WEEKLY, MONTHLY }

    uint256 public constant MAX_POOL_DEPTH = 4;
    uint256 public constant MAX_VAULTS_PER_POOL = 100;
    uint256 public constant MAX_CHILD_POOLS = 50;

    struct Pool {
        uint256 budget;              // Max spend for this pool
        uint256 spent;               // Current spend (resets per period)
        uint256 periodStart;         // When current period started
        Period period;               // Reset frequency

        bytes32 parentPool;          // Parent pool (bytes32(0) = root)
        address[] vaultMembers;      // Direct vault members
        bytes32[] childPools;        // Direct child pools
        bool initialized;            // Has this pool been set up?
    }

    /// @notice Pool ID → Pool data
    mapping(bytes32 => Pool) public pools;

    /// @notice Vault address → which pool it belongs to
    mapping(address => bytes32) public vaultToPool;

    /// @notice Authorized caller for recordSpend (typically SharedBudgetPolicy)
    address public authorizedPolicy;

    // ═════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═════════════════════════════════════════════════════════════════════

    event PoolCreated(
        bytes32 indexed poolId,
        bytes32 indexed parentPool,
        uint256 budget,
        Period period
    );

    event VaultAddedToPool(address indexed vault, bytes32 indexed poolId);
    event ChildPoolAdded(bytes32 indexed childPool, bytes32 indexed parentPool);

    event BudgetSpent(
        bytes32 indexed poolId,
        address indexed vault,
        uint256 amount,
        uint256 newSpent
    );

    event PeriodReset(bytes32 indexed poolId, uint256 newPeriodStart);
    event AuthorizedPolicyChanged(address indexed oldPolicy, address indexed newPolicy);

    // ═════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═════════════════════════════════════════════════════════════════════

    constructor(address _authorizedPolicy) {
        require(_authorizedPolicy != address(0), "SBP: invalid policy");
        authorizedPolicy = _authorizedPolicy;
    }

    function setAuthorizedPolicy(address _authorizedPolicy) external onlyOwner {
        require(_authorizedPolicy != address(0), "SBP: invalid policy");
        address oldPolicy = authorizedPolicy;
        authorizedPolicy = _authorizedPolicy;
        emit AuthorizedPolicyChanged(oldPolicy, _authorizedPolicy);
    }

    // ═════════════════════════════════════════════════════════════════════
    // POOL CREATION & MANAGEMENT
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Create a new pool (root if parentPool == bytes32(0))
    /// @param poolId Unique identifier for this pool
    /// @param parentPool Parent pool (bytes32(0) for root)
    /// @param budget Max spend for this pool
    /// @param _period Reset frequency (DAILY, WEEKLY, MONTHLY)
    /// @param vaults Initial vault members
    /// @param childPoolIds Initial child pools
    function createPool(
        bytes32 poolId,
        bytes32 parentPool,
        uint256 budget,
        Period _period,
        address[] calldata vaults,
        bytes32[] calldata childPoolIds
    ) external onlyOwner {
        require(poolId != bytes32(0), "SBP: invalid poolId");
        require(!pools[poolId].initialized, "SBP: pool exists");
        require(budget > 0, "SBP: budget must be > 0");
        require(vaults.length <= MAX_VAULTS_PER_POOL, "SBP: too many vaults");
        require(childPoolIds.length <= MAX_CHILD_POOLS, "SBP: too many child pools");

        // Validate no cycles and depth
        if (parentPool != bytes32(0)) {
            require(pools[parentPool].initialized, "SBP: parent not found");
            _validateNoCycleAndDepth(poolId, parentPool);
        }

        // Create pool
        pools[poolId] = Pool({
            budget: budget,
            spent: 0,
            periodStart: block.timestamp,
            period: _period,
            parentPool: parentPool,
            vaultMembers: vaults,
            childPools: childPoolIds,
            initialized: true
        });

        // Register vaults
        for (uint i = 0; i < vaults.length; i++) {
            require(vaultToPool[vaults[i]] == bytes32(0), "SBP: vault already in pool");
            vaultToPool[vaults[i]] = poolId;
            emit VaultAddedToPool(vaults[i], poolId);
        }

        // Link child pools
        for (uint i = 0; i < childPoolIds.length; i++) {
            require(pools[childPoolIds[i]].initialized, "SBP: child pool not found");
            require(pools[childPoolIds[i]].parentPool == poolId, "SBP: wrong parent");
            emit ChildPoolAdded(childPoolIds[i], poolId);
        }

        emit PoolCreated(poolId, parentPool, budget, _period);
    }

    /// @notice Add a vault to an existing pool
    function addVaultToPool(bytes32 poolId, address vault) external onlyOwner {
        require(vault != address(0), "SBP: invalid vault");
        require(pools[poolId].initialized, "SBP: pool not found");
        require(vaultToPool[vault] == bytes32(0), "SBP: vault already in pool");
        require(
            pools[poolId].vaultMembers.length < MAX_VAULTS_PER_POOL,
            "SBP: pool full"
        );

        pools[poolId].vaultMembers.push(vault);
        vaultToPool[vault] = poolId;
        emit VaultAddedToPool(vault, poolId);
    }

    /// @notice Add a child pool to an existing parent pool
    function addChildPool(bytes32 parentId, bytes32 childId) external onlyOwner {
        require(pools[parentId].initialized, "SBP: parent not found");
        require(pools[childId].initialized, "SBP: child not found");
        require(pools[childId].parentPool == parentId, "SBP: wrong parent");
        require(
            pools[parentId].childPools.length < MAX_CHILD_POOLS,
            "SBP: too many children"
        );

        pools[parentId].childPools.push(childId);
        emit ChildPoolAdded(childId, parentId);
    }

    // ═════════════════════════════════════════════════════════════════════
    // VALIDATION & SPENDING
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Record spending from a vault (called by SharedBudgetPolicy)
    /// Walks upward through parent chain, validating all levels.
    ///
    /// ATOMIC ACCOUNTING:
    /// 1. CHECK: Validate budget at each pool level (lines 195-198)
    /// 2. EFFECT: Update pool.spent immediately (line 201) BEFORE any external calls
    /// 3. EMIT: Emit BudgetSpent event AFTER state change (line 202)
    ///
    /// This CEI pattern (Checks-Effects-Interactions) ensures:
    /// - Budget is decremented before any transfers or callbacks
    /// - No re-entrancy path through authorizedPolicy can double-spend
    /// - Event logs reflect accurate state
    ///
    /// FIX #25: nonReentrant guard prevents race conditions if
    /// SharedBudgetPolicy or any downstream contract tries to re-enter recordSpend()
    function recordSpend(address vault, uint256 amount) external nonReentrant {
        require(msg.sender == authorizedPolicy, "SBP: only authorized policy");
        require(vault != address(0), "SBP: invalid vault");
        require(amount > 0, "SBP: amount must be > 0");

        bytes32 poolId = vaultToPool[vault];
        require(poolId != bytes32(0), "SBP: vault not in any pool");

        // Walk upward, validating and updating each level
        bytes32 currentPoolId = poolId;
        while (currentPoolId != bytes32(0)) {
            Pool storage currentPool = pools[currentPoolId];
            require(currentPool.initialized, "SBP: invalid pool in chain");

            // Maybe reset period
            _maybeResetPeriod(currentPoolId);

            // CHECKS: Validate budget BEFORE modifying state
            require(
                currentPool.spent + amount <= currentPool.budget,
                "SBP: budget exceeded in pool"
            );

            // EFFECTS: Update spent IMMEDIATELY (no external calls between check and update)
            currentPool.spent += amount;
            emit BudgetSpent(currentPoolId, vault, amount, currentPool.spent);

            // Move to parent
            currentPoolId = currentPool.parentPool;
        }
    }

    /// @notice Check if a proposed spend would be allowed
    function wouldExceedBudget(address vault, uint256 amount)
        external
        view
        returns (bool)
    {
        bytes32 poolId = vaultToPool[vault];
        if (poolId == bytes32(0)) return false;

        bytes32 currentPoolId = poolId;
        while (currentPoolId != bytes32(0)) {
            Pool storage currentPool = pools[currentPoolId];
            if (currentPool.spent + amount > currentPool.budget) {
                return true;
            }
            currentPoolId = currentPool.parentPool;
        }
        return false;
    }

    // ═════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Reset pool period if time has elapsed.
    /// @dev Uses drift-corrected advance (same pattern as BudgetPolicy) so the start boundary
    ///      is always a multiple of periodDuration from the original start, preventing cumulative
    ///      drift when keepers are late. Consistent with BudgetPolicy._maybeResetPeriod().
    function _maybeResetPeriod(bytes32 poolId) internal {
        Pool storage pool = pools[poolId];
        uint256 periodDuration = _getPeriodDuration(pool.period);

        if (block.timestamp >= pool.periodStart + periodDuration) {
            pool.spent = 0;
            // Advance by full period multiples to avoid drift from late transactions.
            uint256 elapsed = block.timestamp - pool.periodStart;
            pool.periodStart += (elapsed / periodDuration) * periodDuration;
            emit PeriodReset(poolId, pool.periodStart);
        }
    }

    /// @notice Get period duration in seconds
    function _getPeriodDuration(Period period) internal pure returns (uint256) {
        if (period == Period.DAILY) return 1 days;
        if (period == Period.WEEKLY) return 7 days;
        return 30 days; // MONTHLY
    }

    /// @notice Validate that adding parentPool to poolId doesn't create cycles
    /// and that depth doesn't exceed MAX_POOL_DEPTH
    function _validateNoCycleAndDepth(bytes32 poolId, bytes32 parentId) internal view {
        uint256 depth = 1;
        bytes32 current = parentId;

        while (current != bytes32(0)) {
            // Check for cycle (if we ever reach poolId, it's a cycle)
            require(current != poolId, "SBP: would create cycle");

            depth++;
            require(depth <= MAX_POOL_DEPTH, "SBP: depth exceeded");

            current = pools[current].parentPool;
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Get full pool data
    function getPool(bytes32 poolId)
        external
        view
        returns (
            uint256 budget,
            uint256 spent,
            uint256 periodStart,
            Period period,
            bytes32 parentPool,
            address[] memory vaultMembers,
            bytes32[] memory childPools
        )
    {
        Pool storage pool = pools[poolId];
        require(pool.initialized, "SBP: pool not found");

        return (
            pool.budget,
            pool.spent,
            pool.periodStart,
            pool.period,
            pool.parentPool,
            pool.vaultMembers,
            pool.childPools
        );
    }

    /// @notice Get which pool owns a vault
    function getVaultPool(address vault) external view returns (bytes32) {
        return vaultToPool[vault];
    }

    /// @notice Get remaining budget in a pool (before period reset)
    function getPoolRemaining(bytes32 poolId) external view returns (uint256) {
        Pool storage pool = pools[poolId];
        require(pool.initialized, "SBP: pool not found");

        if (pool.spent >= pool.budget) return 0;
        return pool.budget - pool.spent;
    }

    /// @notice Get the full ancestry chain of a vault
    function getVaultAncestry(address vault)
        external
        view
        returns (bytes32[] memory)
    {
        bytes32 poolId = vaultToPool[vault];
        if (poolId == bytes32(0)) {
            return new bytes32[](0);
        }

        bytes32[] memory ancestry = new bytes32[](MAX_POOL_DEPTH);
        uint256 count = 0;

        bytes32 current = poolId;
        while (current != bytes32(0)) {
            ancestry[count] = current;
            count++;
            current = pools[current].parentPool;
        }

        // Trim array
        bytes32[] memory result = new bytes32[](count);
        for (uint i = 0; i < count; i++) {
            result[i] = ancestry[i];
        }
        return result;
    }
}
