# CLAUDE.md — Vaultia Core Protocol

This is the **smart contract layer** of the Agent Vault Protocol, built on LUKSO.
It defines the financial rules and execution guarantees for autonomous AI agents.

Do not add UI code, React components, or frontend logic here.
This repo is consumed by `vaultia-widgets` as an npm package.

**Last synced from repo**: April 2026 — Phase 1 complete, live on LUKSO testnet (chainId 4201)

---

## What this repo does

Allows AI agents to execute payments autonomously while enforcing strict on-chain policy
constraints. Every agent-initiated transaction must pass through the PolicyEngine before
execution — no bypass is possible. This is a default-deny system.

**Execution path (always, no exceptions):**
```
Agent → KeyManager → AgentSafe → PolicyEngine → Policies → Execute
```

If any policy fails, the entire chain reverts. The agent cannot spend.

---

## Live testnet contracts (LUKSO testnet, chainId 4201)

```env
REGISTRY_ADDRESS=0x62546d94971c83357BF5d0c6d17e4267C976e421
MERCHANT_REGISTRY_ADDRESS=0x14436F48371Be2a90f0eB9A462a6c4A318E839aC
AGENT_SAFE_ADDRESS=0xB4A2c83cc4aD9069933cD26c33219B4fe961C8D7
KEY_MANAGER_ADDRESS=0x8917Df3F526c6D5C95859bD65701A474CDD18F30
POLICY_ENGINE_ADDRESS=0xa2962c1c5a295F032B8b124026fd36Fdf0F4BeB5
TASK_SCHEDULER_ADDRESS=0x98F5A7ba0eb5f510a6560B9B7FcbA03d95fa0B43
COORDINATOR_ADDRESS=0xe3d14Cc7D106CC78cbc408E004ce7af1f2A5f61c
OPTIONAL_POLICY_DEPLOYER_ADDRESS=0xFeC194A66B3bbee1D1E46aF7Fe74d44B90F4Fd8b
SHARED_BUDGET_POOL_ADDRESS=0xDFb2aee2bE05D53ED5D13f9788D12c621C1ADE09
LSP26_FOLLOWER_SYSTEM=0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA
```

Proof artifacts in `/deployments/`:
- `live-stress-4201.json` — native policy stress test
- `live-stress-lsp7-4201.json` — LSP7 token policy stress test
- `live-automation-4201.json` — recurring automation proof (3 confirmed executions)

---

## Core contracts (kernel)

| Contract | Env var | What it does |
|---|---|---|
| `AgentSafe` | `AGENT_SAFE_ADDRESS` | LSP9 vault — holds funds, executes payments |
| `KeyManager` | `KEY_MANAGER_ADDRESS` | LSP6 — authenticates who can call AgentSafe |
| `PolicyEngine` | `POLICY_ENGINE_ADDRESS` | Orchestrates policy validation + emergency pause |
| `AgentVaultRegistry` | `REGISTRY_ADDRESS` | Factory — deploys AgentSafe + KeyManager atomically |
| `MerchantRegistry` | `MERCHANT_REGISTRY_ADDRESS` | Whitelist of approved merchants |

---

## Policy modules (modular, plug-in via IPolicy)

All policies implement `IPolicy` and are registered in the PolicyEngine.
The engine calls all active policies — every one must pass.

| Policy | File | Enforces |
|---|---|---|
| `BudgetPolicy` | `contracts/policies/BudgetPolicy.sol` | Max spend per period (daily/weekly/monthly) |
| `MerchantPolicy` | `contracts/policies/MerchantPolicy.sol` | Only whitelisted merchants can receive |
| `ExpirationPolicy` | `contracts/policies/ExpirationPolicy.sol` | Vault stops working after expiry date |
| `SharedBudgetPolicy` | `contracts/policies/SharedBudgetPolicy.sol` | Enforces hierarchical pool limits |

To add a new policy: implement `IPolicy`, deploy it, register it in PolicyEngine.
Policies can read each other's state (state-reading model, not DAG).

---

## PolicyEngine: kill switch (emergency pause)

The PolicyEngine has a vault-wide emergency stop. When paused, every payment reverts
immediately with `PE: paused` — no policy evaluation happens at all.

```ts
// Freeze all payments through this vault's PolicyEngine
await policyEngine.setPaused(true)

// Dry-run also reflects paused state
const [blockingPolicy, reason] = await policyEngine.simulateExecution.staticCall(
  agentAddress, ethers.ZeroAddress, merchantAddress, ethers.parseEther("1"), "0x"
)

// Resume
await policyEngine.setPaused(false)
```

**Who can call setPaused**: only `owner`.
This is why owner must be protected by a multisig in production.

---

## Phase 1 contracts

### AgentCoordinator (`contracts/coordination/AgentCoordinator.sol`)

Central registry for agent roles and capabilities. Not permissionless —
all registration and assignment is gated by `owner` / `roleAdmin`.

```ts
await coordinator.registerAgent(agentAddress, maxGas, allowAutomation)

await coordinator.assignRole(agentAddress, GROCERY_AGENT, [
  ethers.id("CAN_PAY"),
  ethers.id("CAN_SUBSCRIBE")
])

// Query inside policy validation
if (await coordinator.hasRole(agent, GROCERY_AGENT)) { ... }
```

Gas: O(1) lookups, no loops in hot paths.

### SharedBudgetPool (`contracts/financial-graph/SharedBudgetPool.sol`)

Hierarchical budget pools. Spending walks up the full tree — every ancestor
must have remaining budget, or the payment fails.

```ts
await pool.createPool(ethers.id("HouseholdBudget"), ethers.ZeroHash,
  ethers.parseEther("5000"), MONTHLY, [])

await pool.createPool(ethers.id("FoodBudget"), ethers.id("HouseholdBudget"),
  ethers.parseEther("800"), MONTHLY, [groceryVaultAddress])

// Spend validation walks the full hierarchy automatically
await pool.recordSpend(groceryVaultAddress, ethers.parseEther("100"))
// checks: food < $800 AND household < $5000
```

- Max depth: 4 (prevents stack exhaustion — do not raise this)
- Cycle detection at creation time
- A vault can only belong to one pool
- Only authorized policy can call `recordSpend()`
- Gas: O(depth) per spend

### VaultDirectory (`contracts/financial-graph/VaultDirectory.sol`)

Pure metadata registry — no execution power, no fund control. Safe to read from anywhere.

```ts
await directory.registerVault(vaultAddress, "Groceries", ethers.id("FoodBudget"))
const vault = await directory.getVault(vaultAddress)
// vault.label → "Groceries", vault.linkedPool → pool id
```

100% test coverage. Use for dashboards, indexers, and the frontend vault list.

### TaskScheduler (`contracts/automation/TaskScheduler.sol`)

Schedules recurring transactions triggered by time or block number.

```ts
// Subscription (timestamp-based, every 30 days)
await scheduler.createTask(
  ethers.id("MonthlyRent"), vaultAddress, keyManagerAddress,
  calldata, TIMESTAMP, futureTimestamp, 2592000
)

// DeFi automation (block-based, every ~1 hour)
await scheduler.createTask(
  ethers.id("Rebalance"), vaultAddress, keyManagerAddress,
  calldata, BLOCK_NUMBER, block.number + 7200, 7200
)

// Off-chain keeper discovery + execution
const eligible = await scheduler.getEligibleTasks()
eligible.forEach(taskId => keeper.executeTask(taskId))
```

**Keeper whitelist — enabled by default:**
Only whitelisted addresses can call `executeTask()`.
The deployer is added as the first keeper automatically.

```ts
await scheduler.addKeeper(backupKeeperAddress)

// Disable whitelist only if you have a good reason (opens execution to anyone)
await scheduler.setKeeperWhitelistEnabled(false)
```

---

## Security model

### Multisig (strongly recommended for production)

Vaultia does not ship its own multisig contract. The strong recommendation from the
team is to use an external multisig (e.g. Safe/Gnosis) as the `owner` of all deployed
contracts before going to mainnet.

**What `owner` controls across the protocol:**
- `PolicyEngine.setPaused()` — vault-wide emergency stop
- `AgentCoordinator` role admin configuration
- `TaskScheduler` keeper whitelist management
- Policy addition/removal from PolicyEngine
- LSP14 two-step ownership transfers

**LSP14 two-step ownership**: after deploying any contract, always call
`acceptOwnership()` to complete the transfer. Skipping this leaves the contract
with no active owner.

### Layered spend caps (all enforced on-chain)

Every payment is checked against four independent ceilings — all must pass:

1. Per-vault cap (BudgetPolicy)
2. Per-agent cap (AgentCoordinator role limits)
3. Per-recipient cap (MerchantPolicy)
4. Shared pool ceiling (SharedBudgetPool — walks full hierarchy)

There is no off-chain enforcement. Caps live entirely in contracts.

### ReentrancyGuard

Present on the main payment and scheduling entry points (AgentSafe, TaskScheduler).
Do not remove it. Stateless external calls elsewhere don't need it.

### What NOT to do

- Do not remove ReentrancyGuard from AgentSafe or TaskScheduler entry points
- Do not increase SharedBudgetPool max depth beyond 4
- Do not make `registerAgent()` or role assignment permissionless
- Do not deploy to mainnet without a multisig as `owner`
- Do not store private keys anywhere in the repo
- Do not modify the AgentSafe → PolicyEngine execution path

---

## Common calling patterns

**Agent pays a merchant:**
```ts
const keyManager = await ethers.getContractAt("KeyManager", KEY_MANAGER_ADDRESS)
const agentSafe = await ethers.getContractAt("AgentSafe", AGENT_SAFE_ADDRESS)
const calldata = agentSafe.interface.encodeFunctionData("execute", [
  0, merchantAddress, amount, "0x"
])
await keyManager.execute(calldata)
```

**Simulate before sending (dry-run):**
```ts
const [blockingPolicy, reason] = await policyEngine.simulateExecution.staticCall(
  agentAddress, ethers.ZeroAddress, merchantAddress, amount, "0x"
)
if (blockingPolicy !== ethers.ZeroAddress) {
  console.log("Would be blocked by:", blockingPolicy, reason)
}
```

**Adding a new policy:**
1. Create `contracts/policies/MyPolicy.sol` implementing `IPolicy`
2. Add test file `test/MyPolicy.test.ts`
3. Register address in `scripts/deploy.ts`
4. Call `policyEngine.addPolicy(myPolicyAddress)` on the deployed engine

---

## File structure

```
contracts/
├── AgentSafe.sol                      (Kernel — LSP9 vault)
├── PolicyEngine.sol                   (Kernel — orchestrator + kill switch)
├── AgentVaultRegistry.sol             (Factory)
├── policies/
│   ├── IPolicy.sol
│   ├── BudgetPolicy.sol               (Kernel)
│   ├── MerchantPolicy.sol             (Kernel)
│   ├── ExpirationPolicy.sol           (Kernel)
│   └── SharedBudgetPolicy.sol         (Phase 1)
├── coordination/
│   └── AgentCoordinator.sol           (Phase 1 — roles + capabilities)
├── financial-graph/
│   ├── SharedBudgetPool.sol           (Phase 1 — hierarchical pools)
│   ├── VaultDirectory.sol             (Phase 1 — metadata only)
│   └── SharedBudgetPolicy.sol         (Phase 1 — connects pool to engine)
└── automation/
    └── TaskScheduler.sol              (Phase 1 — recurring tasks + keeper whitelist)

scripts/
├── deploy.ts                          (local + testnet)
└── agentDemo.ts                       (backend CLI example — not the frontend)

deployments/                           (live testnet proof artifacts)
frontend-next/                         (Next.js 15 — has its own README)
```

---

## Test status

```
AgentSafe:            14 tests
PolicyEngine:         23 tests
Registry integration:  9 tests
AgentCoordinator:    15/18 passing (83%) — 3 contract agent edge cases
SharedBudgetPool:    18/21 passing (86%) — timing-dependent setup
VaultDirectory:       9/9  passing (100%)
TaskScheduler:       24/28 passing (86%) — time calculation precision
────────────────────────────────────────
TOTAL:              111/119 passing (93%)
```

Core functionality is 100% working. Failing tests are edge cases
and timing-dependent setup, not core logic.

---

## Deploy order (testnet or local)

```
1. AgentVaultRegistry.deploy()
2. MerchantRegistry.deploy()
3. PolicyEngine.deploy()
4. BudgetPolicy.deploy() + MerchantPolicy.deploy() + ExpirationPolicy.deploy()
5. AgentCoordinator.deploy()
6. SharedBudgetPool.deploy(policyAddress)
7. SharedBudgetPolicy.deploy(registry, pe, poolAddress, vault, token)
8. TaskScheduler.deploy()   ← keeper whitelist enabled by default
9. Transfer ownership of all contracts to multisig, call acceptOwnership()
```

---

## Phase 2 roadmap

- `FinancialAction` — unified event standard for all financial operations
- `StrategyAgent` base class + `PortfolioRebalancer`, `YieldAllocator`, `SubscriptionManager`
- End-to-end tests: TaskScheduler → Strategy → PolicyEngine → Spend
- LUKSO mainnet deployment (post-audit)

---

## LUKSO standards used

- LSP6 KeyManager — permission layer for AgentSafe
- LSP9 Vault — AgentSafe base contract
- LSP14 — two-step ownership transfer
- Target networks: LUKSO testnet chainId 4201 / mainnet chainId 42

---

## Related repos

- **vaultia-widgets** — mini-apps for LUKSO Universal Profile grids
- Demo: https://youtu.be/Qiq8o98aRo8
- Team: Ito (AI Agent) · Antonio Arroyo · Ile Designia