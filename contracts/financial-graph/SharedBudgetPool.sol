// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title SharedBudgetPool
/// @notice Manages nested, hierarchical budget pools for multi-vault financial coordination.
///         Supports parent-pointer DAG structure with max depth 4.
///
///         Each AgentSafe belongs to exactly one pool. When a payment is made from a vault,
///         SharedBudgetPolicy calls recordSpend(), which walks up the parent chain and validates
///         (and charges) every ancestor pool — creating a strict hierarchical budget model.
///
/// @dev ReentrancyGuard on recordSpend() prevents race conditions if SharedBudgetPolicy
///      is itself a complex contract with external callbacks.
contract SharedBudgetPool is Ownable, ReentrancyGuard {

    enum Period { DAILY, WEEKLY, MONTHLY }

    uint256 public constant MAX_POOL_DEPTH        = 4;
    uint256 public constant MAX_VAULTS_PER_POOL   = 100;
    uint256 public constant MAX_CHILD_POOLS       = 50;

    struct Pool {
        uint256   budget;        // Max spend for this pool per period
        uint256   spent;         // Current spend (resets per period)
        uint256   periodStart;   // When current period started
        Period    period;        // Reset frequency
        bytes32   parentPool;   // Parent pool (bytes32(0) = root)
        address[] vaultMembers; // Direct vault members
        bytes32[] childPools;  // Direct child pool IDs
        bool      initialized;  // Whether this pool has been set up
    }

    /// @notice Pool ID => Pool data
    mapping(bytes32 => Pool) public pools;

    /// @notice Vault address => pool it belongs to
    mapping(address => bytes32) public vaultToPool;

    /// @notice The SharedBudgetPolicy (or other policy) authorized to call recordSpend()
    address public authorizedPolicy;
    /// @notice Addresses authorized to call createPool() on behalf of the protocol.
    ///         Only the AgentVaultRegistry should be added here so it can atomically
    ///         create child pools during deployForAgent() without being the contract owner.
    mapping(address => bool) public authorizedDeployer;
    // ─── Events ───────────────────────────────────────────────────────────────

    event PoolCreated(bytes32 indexed poolId, bytes32 indexed parentPool, uint256 budget, Period period);
    event VaultAddedToPool(address indexed vault, bytes32 indexed poolId);
    event ChildPoolAdded(bytes32 indexed childPool, bytes32 indexed parentPool);
    event BudgetSpent(bytes32 indexed poolId, address indexed vault, uint256 amount, uint256 newSpent);
    event PeriodReset(bytes32 indexed poolId, uint256 newPeriodStart);
    event AuthorizedPolicyChanged(address indexed oldPolicy, address indexed newPolicy);
    event AuthorizedDeployerChanged(address indexed deployer, bool enabled);

    // ─── Initialization ────────────────────────────────────────────────────────

    constructor(address _authorizedPolicy) {
        require(_authorizedPolicy != address(0), "SBPool: invalid policy");
        authorizedPolicy = _authorizedPolicy;
    }

    function setAuthorizedPolicy(address _authorizedPolicy) external onlyOwner {
        require(_authorizedPolicy != address(0), "SBPool: invalid policy");
        address oldPolicy = authorizedPolicy;
        authorizedPolicy  = _authorizedPolicy;
        emit AuthorizedPolicyChanged(oldPolicy, _authorizedPolicy);
    }

    /// @notice Grant or revoke the right to call createPool() outside of the owner.
    ///         Only the AgentVaultRegistry should be authorized here.
    function setAuthorizedDeployer(address deployer_, bool enabled) external onlyOwner {
        require(deployer_ != address(0), "SBPool: invalid deployer");
        authorizedDeployer[deployer_] = enabled;
        emit AuthorizedDeployerChanged(deployer_, enabled);
    }

    // ─── Pool creation & management ───────────────────────────────────────────

    /// @notice Create a new budget pool.
    /// @param poolId       Unique identifier for this pool (use keccak256 of a label)
    /// @param parentPool   Parent pool ID (bytes32(0) for root)
    /// @param budget       Max spend per period
    /// @param _period      Reset frequency
    /// @param vaults       Initial vault members
    /// @param childPoolIds Pre-existing child pool IDs to link (must already exist with correct parent)
    function createPool(
        bytes32   poolId,
        bytes32   parentPool,
        uint256   budget,
        Period    _period,
        address[] calldata vaults,
        bytes32[] calldata childPoolIds
    ) external {
        require(
            msg.sender == owner() || authorizedDeployer[msg.sender],
            "SBPool: not authorized"
        );
        require(poolId != bytes32(0), "SBPool: invalid poolId");
        require(!pools[poolId].initialized, "SBPool: pool exists");
        require(budget > 0, "SBPool: budget must be > 0");
        require(vaults.length        <= MAX_VAULTS_PER_POOL, "SBPool: too many vaults");
        require(childPoolIds.length  <= MAX_CHILD_POOLS,     "SBPool: too many child pools");

        if (parentPool != bytes32(0)) {
            require(pools[parentPool].initialized, "SBPool: parent not found");
            _validateNoCycleAndDepth(poolId, parentPool);
        }

        pools[poolId] = Pool({
            budget:      budget,
            spent:       0,
            periodStart: block.timestamp,
            period:      _period,
            parentPool:  parentPool,
            vaultMembers: new address[](0),
            childPools:  new bytes32[](0),
            initialized: true
        });

        for (uint256 i = 0; i < vaults.length; i++) {
            require(vaultToPool[vaults[i]] == bytes32(0), "SBPool: vault already in pool");
            pools[poolId].vaultMembers.push(vaults[i]);
            vaultToPool[vaults[i]] = poolId;
            emit VaultAddedToPool(vaults[i], poolId);
        }

        for (uint256 i = 0; i < childPoolIds.length; i++) {
            require(pools[childPoolIds[i]].initialized, "SBPool: child pool not found");
            require(pools[childPoolIds[i]].parentPool == poolId, "SBPool: wrong parent");
            pools[poolId].childPools.push(childPoolIds[i]);
            emit ChildPoolAdded(childPoolIds[i], poolId);
        }

        emit PoolCreated(poolId, parentPool, budget, _period);
    }

    /// @notice Add a vault to an existing pool.
    function addVaultToPool(bytes32 poolId, address vault) external onlyOwner {
        require(vault != address(0), "SBPool: invalid vault");
        require(pools[poolId].initialized, "SBPool: pool not found");
        require(vaultToPool[vault] == bytes32(0), "SBPool: vault already in pool");
        require(pools[poolId].vaultMembers.length < MAX_VAULTS_PER_POOL, "SBPool: pool full");
        pools[poolId].vaultMembers.push(vault);
        vaultToPool[vault] = poolId;
        emit VaultAddedToPool(vault, poolId);
    }

    /// @notice Add a child pool to an existing parent.
    function addChildPool(bytes32 parentId, bytes32 childId) external onlyOwner {
        require(pools[parentId].initialized, "SBPool: parent not found");
        require(pools[childId].initialized,  "SBPool: child not found");
        require(pools[childId].parentPool == parentId, "SBPool: wrong parent");
        require(pools[parentId].childPools.length < MAX_CHILD_POOLS, "SBPool: too many children");
        pools[parentId].childPools.push(childId);
        emit ChildPoolAdded(childId, parentId);
    }

    // ─── Spend recording ──────────────────────────────────────────────────────

    /// @notice Record spending from a vault. Walks up the ancestor chain, validating
    ///         and charging each pool. Reverts if any pool would be exceeded.
    ///
    ///         CEI pattern:
    ///         1. CHECK:  validate budget at each pool level
    ///         2. EFFECT: update pool.spent immediately
    ///         3. EMIT:   emit BudgetSpent after state change
    function recordSpend(address vault, uint256 amount) external nonReentrant {
        require(msg.sender == authorizedPolicy, "SBPool: only authorized policy");
        require(vault  != address(0), "SBPool: invalid vault");
        require(amount > 0,           "SBPool: amount must be > 0");

        bytes32 poolId = vaultToPool[vault];
        require(poolId != bytes32(0), "SBPool: vault not in any pool");

        bytes32 currentPoolId = poolId;
        while (currentPoolId != bytes32(0)) {
            Pool storage cur = pools[currentPoolId];
            require(cur.initialized, "SBPool: invalid pool in chain");

            _maybeResetPeriod(currentPoolId);

            require(cur.spent + amount <= cur.budget, "SBPool: budget exceeded in pool");
            cur.spent += amount;
            emit BudgetSpent(currentPoolId, vault, amount, cur.spent);

            currentPoolId = cur.parentPool;
        }
    }

    /// @notice Simulate whether a proposed spend would exceed any pool in the chain.
    function wouldExceedBudget(address vault, uint256 amount) external view returns (bool) {
        bytes32 poolId = vaultToPool[vault];
        if (poolId == bytes32(0)) return false;

        bytes32 currentPoolId = poolId;
        while (currentPoolId != bytes32(0)) {
            Pool storage cur = pools[currentPoolId];
            if (cur.spent + amount > cur.budget) return true;
            currentPoolId = cur.parentPool;
        }
        return false;
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function _maybeResetPeriod(bytes32 poolId) internal {
        Pool storage pool = pools[poolId];
        uint256 duration  = _getPeriodDuration(pool.period);
        if (block.timestamp >= pool.periodStart + duration) {
            pool.spent = 0;
            uint256 elapsed = block.timestamp - pool.periodStart;
            pool.periodStart += (elapsed / duration) * duration;
            emit PeriodReset(poolId, pool.periodStart);
        }
    }

    function _getPeriodDuration(Period period) internal pure returns (uint256) {
        if (period == Period.DAILY)  return 1 days;
        if (period == Period.WEEKLY) return 7 days;
        return 30 days; // MONTHLY
    }

    function _validateNoCycleAndDepth(bytes32 poolId, bytes32 parentId) internal view {
        uint256 depth   = 1;
        bytes32 current = parentId;
        while (current != bytes32(0)) {
            require(current != poolId, "SBPool: would create cycle");
            depth++;
            require(depth <= MAX_POOL_DEPTH, "SBPool: depth exceeded");
            current = pools[current].parentPool;
        }
    }

    // ─── View functions ───────────────────────────────────────────────────────

    function getPool(bytes32 poolId)
        external
        view
        returns (
            uint256   budget,
            uint256   spent,
            uint256   periodStart,
            Period    period,
            bytes32   parentPool,
            address[] memory vaultMembers,
            bytes32[] memory childPools
        )
    {
        Pool storage pool = pools[poolId];
        require(pool.initialized, "SBPool: pool not found");
        return (pool.budget, pool.spent, pool.periodStart, pool.period, pool.parentPool, pool.vaultMembers, pool.childPools);
    }

    function getVaultPool(address vault) external view returns (bytes32) {
        return vaultToPool[vault];
    }

    function getPoolRemaining(bytes32 poolId) external view returns (uint256) {
        Pool storage pool = pools[poolId];
        require(pool.initialized, "SBPool: pool not found");
        if (pool.spent >= pool.budget) return 0;
        return pool.budget - pool.spent;
    }

    function getVaultAncestry(address vault) external view returns (bytes32[] memory) {
        bytes32 poolId = vaultToPool[vault];
        if (poolId == bytes32(0)) return new bytes32[](0);

        bytes32[] memory ancestry = new bytes32[](MAX_POOL_DEPTH);
        uint256 count = 0;
        bytes32 current = poolId;
        while (current != bytes32(0)) {
            ancestry[count] = current;
            count++;
            current = pools[current].parentPool;
        }

        bytes32[] memory result = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = ancestry[i];
        }
        return result;
    }
}
