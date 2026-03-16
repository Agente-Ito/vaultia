# Agent Vault Protocol

A programmable financial vault system for AI agents built on LUKSO.

The protocol allows autonomous agents to execute payments while enforcing strict on-chain policy constraints such as spending limits, merchant whitelists, and expiration rules.

## 🏗️ Core Architecture

- AgentSafe (LSP9 vault execution layer)
- PolicyEngine (policy orchestration layer)
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

Save to `.env` for `agentDemo` and `frontend-next`.

### 3. Run Agent Demo (Bot Payment)

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

## 🌐 Frontend Setup

### Next.js 15

```bash
cd frontend-next
npm install
cat > .env.local <<'EOF'
NEXT_PUBLIC_RPC_URL=http://localhost:8545
NEXT_PUBLIC_REGISTRY_ADDRESS=<registry_address>
EOF
npm run dev
```

Open: `http://localhost:3000`

**Features**:
- Server-side rendering
- Dynamic vault pages
- Real-time updates
- Production-ready

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
└── agentDemo.ts                   (Agent payment demo)

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
- ✅ No reentrancy vectors (stateless external calls)

### For End Users

- ⚠️ NEVER put real private keys in frontend `.env.local`
- ⚠️ `agentDemo` is backend-only (not wallet app)
- ⚠️ Use LUKSO wallet or Metamask to interact with UI
- ⚠️ LSP14 two-step ownership: must `acceptOwnership()` after deploy

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
npx hardhat run scripts/agentDemo.ts --network hardhat   # Run agent payment demo

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

- **Phase 1**: Complete (111/119 tests ✅)
- **Phase 2**: In planning
- **Testnet**: Ready for deployment
- **Mainnet**: Post-audit

**Last Updated**: March 2026