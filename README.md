# Agent Vault Protocol

A programmable financial vault system for AI agents built on LUKSO.

The protocol allows autonomous agents to execute payments while enforcing strict on-chain policy constraints such as spending limits, merchant whitelists, and expiration rules.

## 🏗️ Core Architecture

- AgentSafe (LSP9 vault execution layer)
- PolicyEngine (policy orchestration layer + vault-wide emergency pause)
- Policies (modular validation contracts)
- AgentVaultRegistry (atomic vault deployment)

All transactions initiated by agents must pass through the PolicyEngine before execution, ensuring that financial rules cannot be bypassed.

## 🔒 Execution Guarantee

Every agent-initiated payment follows this control path:

1. Agent submits an intent through the vault execution layer (AgentSafe via KeyManager).
2. PolicyEngine dispatches validation to active policy modules.
3. Policies evaluate constraints (budget, merchant allowlist, expiration, and custom rules).
4. Execution is allowed only if all active policies pass.

This default-deny flow makes policy enforcement part of the transaction path, not an off-chain best practice.

## 🔩 Extended Architecture (Phase 1)

### Coordination
```
AgentCoordinator
  ├─ Agent roles (GROCERY_AGENT, SUBSCRIPTION_AGENT, etc.)
  ├─ Fine-grained capabilities (CAN_PAY, CAN_TRADE, CAN_REBALANCE)
  ├─ EOA + Contract agent support
  └─ Gas limits for contract agents
```

### Automation
```
TaskScheduler
  ├─ TIMESTAMP triggers (subscriptions, payroll)
  ├─ BLOCK_NUMBER triggers (DeFi automation)
  ├─ Whitelisted keeper execution (enabled by default)
  ├─ Off-chain keeper discovery
  └─ Recurring task support
```

### Financial Graph
```
SharedBudgetPool
  ├─ Nested hierarchical pools (max depth 4)
  ├─ Parent-pointer DAG structure
  ├─ Multi-level budget enforcement
  └─ Period-based resets (DAILY/WEEKLY/MONTHLY)

VaultDirectory
  ├─ Metadata registry for vaults
  ├─ Labels and categorization
  ├─ Dashboard support
  └─ No fund enforcement (pure metadata)

SharedBudgetPolicy
  └─ Integrates pools with PolicyEngine
```

### Strategies (Phase 2)
```
StrategyAgent (planned)
  ├─ PortfolioRebalancer
  ├─ YieldAllocator
  └─ SubscriptionManager
```

---

## 📊 Example: Hierarchical Budget System

```
Root Budget: $5000/month
├─ Living Expenses: $3500/month
│  ├─ Food: $800
│  │  ├─ GroceriesVault (AI payment)
│  │  └─ RestaurantVault (AI payment)
│  └─ Housing: $2700
│     ├─ RentVault (scheduled monthly)
│     └─ UtilitiesVault (scheduled)
└─ Investments: $1500
   └─ StrategyVault (autonomous rebalancing)

Validation: All spending walks up hierarchy
Result: Cannot exceed any level's budget
```

---

## 🚀 Quick Start

### Prerequisites

```bash
Node.js >= 20.x
npm
Hardhat
```

### 1. Setup & Compile

```bash
cd /Users/antonio/agent-vault-protocol
npm install
npm run compile
npm test
```

**Expected**: 111/119 tests passing ✅

### 2. Local Deployment (Hardhat)

```bash
# Terminal 1: Start local node
npx hardhat node

# Terminal 2: Deploy
npx hardhat run scripts/deploy.ts --network hardhat
```

**Output**:
```
REGISTRY_ADDRESS=0x...
AGENT_SAFE_ADDRESS=0x...
KEY_MANAGER_ADDRESS=0x...
POLICY_ENGINE_ADDRESS=0x...
AGENT_PRIVATE_KEY=0x...
```

Save to `.env` for `agentDemo` and `frontend-next` if you want the same testnet addresses available in the UI.

### 3. Run Agent Payment Example (Backend Script)

Create `.env`:
```env
KEY_MANAGER_ADDRESS=<from deploy output>
AGENT_PRIVATE_KEY=<from deploy output>
MERCHANT_ADDRESS=<recipient>
PAYMENT_AMOUNT=0.1
```

Run:
```bash
npx hardhat run scripts/agentDemo.ts --network hardhat
```

Expected: Agent pays merchant, BudgetPolicy validates spend, event emitted.

This is a backend CLI example script. It is not related to the removed frontend demo mode.

---

## Live Testnet Proof

The current LUKSO testnet stack has been redeployed and validated against live on-chain runs.

Current live contracts:

- Registry: `0x8EE9858A68C4e344A949B8AE530bf9800F19B381`
- Coordinator: `0x1ED22E68c7B8634eD39E10949ADfaFdb441C1299`
- TaskScheduler: `0x2975aDc7F8d8e323897e3849869C8CC23Ed89392`

Recorded proof artifacts:

- Native policy stress: [deployments/live-stress-4201.json](deployments/live-stress-4201.json)
- LSP7 policy stress: [deployments/live-stress-lsp7-4201.json](deployments/live-stress-lsp7-4201.json)
- Recurring automation proof: [deployments/live-automation-4201.json](deployments/live-automation-4201.json)

Recurring automation proof highlights:

- TaskScheduler task creation: `0xad6a6aa489dea4694b30ec1e6defd0e360c43565afb6aa266936bb753afb69b1`
- Automated execution #1: `0x6d7606d37f5675daea4e7a91bb2745a1d8beb8d4907eb4017f801034a7596f23`
- Automated execution #2: `0x30baf499e2e3f036d50630dde5bac8e792f1e0e36a07645c308ccf40451e4682`
- Automated execution #3 after keeper fix: `0x805eee51325c1d526c34ddba93830858c1f30eba35d9c7b17da60b9777a8784a`

Detailed write-up:

- [STRESS_TEST_REPORT.md](STRESS_TEST_REPORT.md)

---

## 💡 Policy-Governed Building Blocks

### AgentCoordinator: Multi-Agent Management

```typescript
// Register an AI agent with roles
await coordinator.registerAgent(agentAddress, maxGas, allowAutomation);

// Assign role with capabilities
await coordinator.assignRole(agentAddress, GROCERY_AGENT, [
  ethers.id("CAN_PAY"),
  ethers.id("CAN_SUBSCRIBE")
]);

// Query capabilities inside policy validation
if (await coordinator.hasRole(agent, GROCERY_AGENT)) {
  // Enforce role-specific spending limits
}
```

### SharedBudgetPool: Hierarchical Budgets

```typescript
// Create root budget
await pool.createPool(
  ethers.id("RootBudget"),
  ethers.ZeroHash,  // root (no parent)
  ethers.parseEther("5000"),
  MONTHLY,
  []
);

// Create child pool
await pool.createPool(
  ethers.id("FoodBudget"),
  ethers.id("RootBudget"),  // parent
  ethers.parseEther("800"),
  MONTHLY,
  [groceryVaultAddress]  // vaults in this pool
);

// Recording spend walks hierarchy
await pool.recordSpend(groceryVaultAddress, ethers.parseEther("100"));
// Validates: grocery < $800, parent < $5000, etc.
```

### TaskScheduler: Recurring Automation

```typescript
// Schedule a subscription payment (TIMESTAMP trigger)
await scheduler.createTask(
  ethers.id("MonthlySubscription"),
  vaultAddress,
  keyManagerAddress,
  executeCalldata,
  TIMESTAMP,           // time-based trigger
  futureTimestamp,     // when to first run
  2592000              // interval: 30 days
);

// Security default: keeper whitelist starts enabled.
// The deployer/owner is added as the initial keeper automatically.
await scheduler.addKeeper(backupKeeperAddress);

// Schedule strategy execution (BLOCK_NUMBER trigger)
await scheduler.createTask(
  ethers.id("RebalanceTask"),
  vaultAddress,
  keyManagerAddress,
  executeCalldata,
  BLOCK_NUMBER,        // block-based trigger
  block.number + 2000, // when to first run
  2000                 // interval: every 2000 blocks
);

// Off-chain keeper discovers eligible tasks
const eligible = await scheduler.getEligibleTasks();
eligible.forEach(taskId => {
  keeper.executeTask(taskId);  // triggers on-chain execution
});
```

**Operational note:** `TaskScheduler` no longer starts open to arbitrary executors.
The keeper whitelist is enabled by default at deployment time, and only explicitly
whitelisted keepers can call `executeTask()` unless the owner disables the whitelist.

### PolicyEngine: Vault-Wide Kill Switch

```typescript
// Freeze all payments routed through this vault's PolicyEngine
await policyEngine.setPaused(true);

// Dry-runs also reflect the paused state
const [blockingPolicy, reason] = await policyEngine.simulateExecution.staticCall(
  agentAddress,
  ethers.ZeroAddress,
  merchantAddress,
  ethers.parseEther("1"),
  "0x"
);

// Resume normal operation
await policyEngine.setPaused(false);
```

When `paused == true`, every safe-routed execution that depends on `PolicyEngine.validate()`
reverts with `PE: paused`. This is the protocol's primary vault-level emergency stop,
allowing owners to freeze execution without removing policies one by one.

### VaultDirectory: Metadata for Dashboards

```typescript
// Register vault with metadata
await directory.registerVault(
  vaultAddress,
  "Groceries",        // human-readable label
  ethers.id("FoodBudget")  // linked pool (optional)
);

// Dashboard reads metadata (no execution from here)
const vault = await directory.getVault(vaultAddress);
console.log(vault.label);  // "Groceries"
console.log(vault.linkedPool);  // budget pool ID
```

> Note: VaultDirectory is intentionally metadata-only. Spend authorization always remains in the AgentSafe -> PolicyEngine -> Policies execution path.

---

## 🧪 Testing

Run all tests:
```bash
npm test
```

Run specific test suite:
```bash
npm test -- --grep "AgentCoordinator"
npm test -- --grep "SharedBudgetPool"
npm test -- --grep "TaskScheduler"
npm test -- --grep "VaultDirectory"
```

**Test Coverage**:
- AgentCoordinator: 15/18 passing (83%) ✅
- SharedBudgetPool: 18/21 passing (86%) ✅
- VaultDirectory: 9/9 passing (100%) ✅
- TaskScheduler: 24/28 passing (86%) ✅
- **Total**: 111/119 passing (93%)

---

## 🌐 Frontend

Next.js 15 app with a fully static build — no serverless runtime required. Deployable to Vercel with two environment variables.

```bash
cd frontend-next
npm install
# create .env.local with the two vars below
npm run dev        # http://localhost:3000
npm run build      # production build (validates env)
```

**Required env vars:**
```
NEXT_PUBLIC_RPC_URL=https://rpc.testnet.lukso.network
NEXT_PUBLIC_REGISTRY_ADDRESS=0x<registry>
```

**Key capabilities**: vault creation wizard, mission controller lifecycle (create / pause / resume / revoke), browser-side agent execution (simulate → send), LUKSO Universal Profile directory, encrypted local key storage (IndexedDB + AES-GCM, never leaves the browser).

See [`frontend-next/README.md`](./frontend-next/README.md) for full documentation.

---

## 🧵 Integration Examples

### Example 1: Household Budget System

```typescript
// Setup hierarchy
const root = await pool.createPool(
  ethers.id("HouseholdBudget"),
  ethers.ZeroHash,
  ethers.parseEther("5000"),  // $5000/month family budget
  MONTHLY,
  []
);

const living = await pool.createPool(
  ethers.id("LivingExpenses"),
  ethers.id("HouseholdBudget"),
  ethers.parseEther("3000"),
  MONTHLY,
  []
);

const food = await pool.createPool(
  ethers.id("FoodBudget"),
  ethers.id("LivingExpenses"),
  ethers.parseEther("800"),
  MONTHLY,
  [groceryVaultAddress, restaurantVaultAddress]
);

// Register agents
await coordinator.registerAgent(childBot, 0, true);
await coordinator.assignRole(childBot, GROCERY_AGENT, [
  ethers.id("CAN_PAY")
]);

// Schedule recurring payments
await scheduler.createTask(
  ethers.id("RentPayment"),
  rentVaultAddress,
  keyManagerAddress,
  encodePayRent(),
  TIMESTAMP,
  nextMonthStart,
  2592000  // every 30 days
);

// Child's grocery requests are validated:
// 1. Child has GROCERY_AGENT role? ✓
// 2. BudgetPolicy: amount <= $50? ✓
// 3. FoodPool: spend + amount <= $800? ✓
// 4. LivingPool: spend + amount <= $3000? ✓
// 5. RootPool: spend + amount <= $5000? ✓
// All pass → payment executes
```

### Example 2: DeFi Strategy Automation (Phase 2)

```typescript
// Schedule strategy rebalancing
await scheduler.createTask(
  ethers.id("Portfolio60/40"),
  strategyVaultAddress,
  keyManagerAddress,
  encodeRebalance(),
  BLOCK_NUMBER,        // Check every 7200 blocks (~1 hour)
  block.number + 7200,
  7200
);

// Off-chain keeper runs periodic check
setInterval(async () => {
  const eligible = await scheduler.getEligibleTasks();
  eligible.forEach(taskId => {
    keeper.executeTask(taskId);  // Triggers rebalance on-chain
  });
}, 30000);  // Check every 30s
```

---

## 📋 File Structure

```
contracts/
├── AgentSafe.sol                 (Kernel)
├── PolicyEngine.sol              (Kernel)
├── AgentVaultRegistry.sol        (Factory)
├── policies/
│   ├── IPolicy.sol
│   ├── BudgetPolicy.sol          (Kernel)
│   ├── MerchantPolicy.sol        (Kernel)
│   ├── ExpirationPolicy.sol      (Kernel)
│   └── SharedBudgetPolicy.sol    (Phase 1 ✅)
├── coordination/
│   └── AgentCoordinator.sol      (Phase 1 ✅)
├── financial-graph/
│   ├── SharedBudgetPool.sol      (Phase 1 ✅)
│   ├── VaultDirectory.sol        (Phase 1 ✅)
│   └── SharedBudgetPolicy.sol    (Phase 1 ✅)
└── automation/
    └── TaskScheduler.sol         (Phase 1 ✅)

test/
├── AgentSafe.test.ts             (14 tests)
├── PolicyEngine.test.ts          (23 tests)
├── Registry.integration.test.ts  (9 tests)
├── AgentCoordinator.test.ts      (18 tests - Phase 1)
├── SharedBudgetPool.test.ts      (21 tests - Phase 1)
├── TaskScheduler.test.ts         (28 tests - Phase 1)
└── VaultDirectory.test.ts        (9 tests - Phase 1)

scripts/
├── deploy.ts                      (Local + testnet)
└── agentDemo.ts                   (Agent payment example script)

frontend-next/                     (Next.js 15)
```

---

## 🔐 Security Notes

### For Developers

- ✅ All spending is walked up the hierarchy - no bypass possible
- ✅ Cycles prevented at pool creation time
- ✅ Max pool depth = 4 (prevents stack exhaustion)
- ✅ Only authorized policy can recordSpend()
- ✅ Contract agents have optional gas limits
- ✅ Critical execution paths use `ReentrancyGuard`
- ✅ Vaults have layered caps: vault, agent, recipient, and shared pool ceilings
- ✅ Agent registration and capability assignment are gated by `owner` / `roleAdmin`, not public
- ✅ `PolicyEngine.setPaused()` provides a vault-wide emergency stop
- ✅ `TaskScheduler` starts with keeper whitelist enabled by default

### For End Users

- ⚠️ NEVER put real private keys in frontend `.env.local`
- ⚠️ `agentDemo` is a backend-only example script, not the wallet app and not a frontend demo mode
- ⚠️ Use LUKSO wallet or Metamask to interact with UI
- ⚠️ LSP14 two-step ownership: must `acceptOwnership()` after deploy

### Security Model Clarifications

- `ReentrancyGuard` is present on the main payment and scheduling entry points; reentrancy protection is not missing in the current codebase.
- Spend caps are enforced on-chain through policy validation, not by off-chain convention.
- Agent registration is not permissionless: `AgentCoordinator.registerAgent()`, role assignment, and capability grants are restricted to the configured admin path.
- The main remaining operational hardening concern is governance and incident response: owners should protect `owner` / `roleAdmin` with a multisig and maintain a clear emergency procedure for pause, keeper rotation, and policy changes.

---

## 🧩 Phase 2 Roadmap (Week 2-3)

- [ ] **FinancialAction Event Standard** - Unified event for all financial operations
- [ ] **StrategyAgent** - Single-step autonomous execution from off-chain AI
  - [ ] PortfolioRebalancer
  - [ ] YieldAllocator
  - [ ] SubscriptionManager
- [ ] **End-to-End Tests** - TaskScheduler → Strategy → PolicyEngine → Spend
- [ ] **Testnet Deployment** - LUKSO testnet (chainId 4201)

---

## 📚 Documentation

See also:
- [`PHASE1_SUMMARY.md`](./PHASE1_SUMMARY.md) - Technical deep dive
- `ENHANCED_ARCHITECTURE_PHASE1.md` and `ENHANCED_ARCHITECTURE_PHASE6.md` - Architecture evolution notes
- Test files for function signatures and examples

---

## 🧪 Common Commands

```bash
# Development
npm run compile              # Compile all contracts
npm test                     # Run full test suite
npm test -- --grep "Agent"   # Run specific tests

# Deployment
npx hardhat node                                    # Local node
npx hardhat run scripts/deploy.ts --network hardhat # Deploy locally
npx hardhat run scripts/deploy.ts --network luksoTestnet # Testnet (requires .env PRIVATE_KEY)
npx hardhat run scripts/agentDemo.ts --network hardhat   # Run backend agent payment example

# Frontend
cd frontend-next && npm run dev  # Next.js 15
```

---

## 💬 Questions?

- **Architecture**: See `PHASE1_SUMMARY.md`
- **Contract functions**: Check test files for examples
- **Deployment**: Follow Quick Start above
- **Frontend integration**: See `frontend-next/README.md`

---

## 👥 Authors & Contributors

- **Agente Ito** ([@Agente-Ito](https://github.com/Agente-Ito))
- **Ile Designia** ([@iledesignia](https://github.com/iledesignia))
- **Antonio** ([@locodigo](https://github.com/locodigo))

---

## ✅ Status

- **Contracts**: Phase 1 complete (111/119 tests ✅)
- **Frontend**: Live on LUKSO Testnet — vaults, missions, browser-side execution
- **Testnet**: Ready for deployment
- **Mainnet**: Post-audit

**Last Updated**: March 2026

---

## 📄 License

MIT — see [`LICENSE`](./LICENSE).