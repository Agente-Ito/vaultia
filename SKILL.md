# Vaultia Protocol — Agent SKILL

## What this file is
This file gives an AI agent the minimum working context needed to interact with the current Vaultia protocol safely.

It is written for two use cases:
- an agent operating inside an already configured vault
- an orchestrator agent helping a human deploy or configure vault infrastructure

This document is intentionally conservative. When a capability is only partially wired today, it is labeled as such instead of being presented as live functionality.

## Mental model
Vaultia is a constrained execution layer for AI-driven finance.

Agents do not own vault funds.
They act through permissions that a human owner configures ahead of time.

In the current LUKSO flow, a payment is only successful when all of these layers agree:
1. the LSP6 KeyManager accepts the caller and payload
2. the AgentSafe forwards the action through the safe execution path
3. the PolicyEngine validates every active policy

If any of those checks fails, execution reverts.

## Reality check: what is true today
- The canonical live execution path is `LSP6KeyManager.execute(...) -> AgentSafe.execute(...) -> PolicyEngine.validate(...)`.
- `AgentCoordinator` exists and supports `registerAgent`, `assignRole`, `grantCapability`, delegation depth, and delegated deployment metadata.
- `AgentCoordinator` roles and capabilities do not replace LSP6 permissions. Live execution still depends on KeyManager permissions and AllowedCalls configuration.
- `PolicyEngine` has a vault-wide pause switch via `setPaused(bool)`.
- `TaskScheduler` is passive. It never self-executes; an off-chain keeper must poll and call `executeTask(taskId)`.
- New `TaskScheduler` deployments start with keeper whitelist enforcement enabled and the deployer whitelisted by default.
- `VaultDirectory` exists as a metadata/discovery layer for vault hierarchies, but it is not part of the default root deployment path in `scripts/deploy.ts`.

## ROLE A: Agent operating inside a configured vault

### Preconditions
Before you try to execute anything, verify all of the following:
- You have a controller address that the vault KeyManager recognizes.
- That controller has the required LSP6 permissions for the intended action.
- If the vault uses strict payment permissions, AllowedCalls includes the destination you need.
- The vault is funded.
- The vault has an `AgentSafe`, a `KeyManager`, and a linked `PolicyEngine`.
- The `PolicyEngine` is not paused.
- If the workflow relies on coordinator metadata, your agent is registered in `AgentCoordinator` and has the expected role or capabilities.

### Canonical payment flow on LUKSO
Use this path as the default mental model for real integrations:
1. Build calldata for `AgentSafe.execute(...)`.
2. Call `LSP6KeyManager.execute(payload)` from the authorized controller or agent address.
3. The KeyManager checks permissions and AllowedCalls.
4. The KeyManager forwards to `AgentSafe.execute(...)`.
5. `AgentSafe` calls `PolicyEngine.validate(...)` before execution.
6. Every active policy must pass or the transaction reverts.

For native LYX transfers, the payload is typically a `safe.execute(CALL, to, amount, 0x)` call.

For token transfers, the same guarded path applies, but the `PolicyEngine` validates the actual token contract and transfer parameters.

### Important note about tests vs production
Some unit tests call `agentExecute(...)` or `agentTransferToken(...)` directly for simplicity.

Do not treat that shortcut as the default production integration path.
For live vault operation, assume the KeyManager path is the canonical one unless you know the vault was intentionally configured for a different controller flow.

### Why your transaction can be blocked
- Your controller lacks the required LSP6 permission.
- AllowedCalls does not permit the destination or call pattern.
- The vault-wide pause is active in `PolicyEngine`.
- `BudgetPolicy` blocks the spend.
- `MerchantPolicy` blocks the recipient.
- `ExpirationPolicy` blocks the action because the vault or permission expired.
- `SharedBudgetPolicy` or `SharedBudgetPool` blocks the spend because an ancestor pool is exhausted.
- The vault balance is insufficient.

### What you cannot do
- You cannot bypass the KeyManager or policy validation path in the standard flow.
- You cannot grant yourself new LSP6 permissions.
- You cannot grant yourself new coordinator roles or capabilities.
- You cannot move funds outside the destinations and budgets the owner configured.
- You cannot ignore a vault-wide pause.

## ROLE B: Orchestrator agent assisting setup

### Default root deployment flow today
The current root deployment script is `scripts/deploy.ts`.

Its default order is:
1. deploy `MerchantRegistry`
2. deploy `AgentVaultDeployerCore`
3. deploy `AgentVaultDeployer`
4. deploy `AgentKMDeployer`
5. deploy `TaskScheduler`
6. deploy `AgentCoordinator`
7. deploy `SharedBudgetPool`
8. deploy `AgentVaultRegistry`
9. authorize the registry in `AgentCoordinator` and `SharedBudgetPool`
10. deploy vaults through `AgentVaultRegistry`

### Delegated deployment flow
`AgentVaultRegistry.deployForAgent(...)` is the delegated deployment path.

That flow currently depends on:
- the registry being authorized in `AgentCoordinator`
- the registry being authorized in `SharedBudgetPool`
- the deploying agent respecting delegation depth limits
- propagated capabilities being a subset of the deployer's capabilities

### Ownership and post-deploy steps
After vault deployment, make sure the human owner completes the remaining operational steps:
- accept LSP14 ownership on `AgentSafe`
- fund the vault
- verify LSP6 controller permissions and AllowedCalls
- confirm policy configuration
- configure automation only after the vault and keeper model are ready

### Budget hierarchy facts
- `SharedBudgetPool` supports nested parent-pointer pools with max depth `4`.
- A vault can belong to exactly one pool.
- Spending is charged against the vault's pool and all ancestor pools.
- `VaultDirectory` is useful for discovery and labeling, but it is metadata only. It does not enforce budgets or permissions.

## Automation

### Current model
Automation in Vaultia is best-effort and keeper-driven.

The on-chain contract stores schedules, but an off-chain service must execute them:
1. call `getEligibleTasks()` periodically
2. call `executeTask(taskId)` for each eligible task

### Keeper trust and safety model
- `TaskScheduler` does not hold vault funds.
- The keeper triggers an already configured on-chain path; it does not get spending authority by itself.
- A keeper can still fail on liveness. If it is offline, tasks are delayed or missed.
- New scheduler deployments enforce a keeper whitelist by default.
- If whitelist enforcement is enabled, each keeper must be added explicitly on-chain.

## Roadmap / future-facing notes
These points are plausible extensions, but should not be assumed to be universally available today:
- broader self-serve agent publishing and registration flows in the app
- richer sub-vault discovery and graph workflows powered by `VaultDirectory`
- more automated operator tooling around keeper redundancy and reconciliation

If you are acting autonomously, prefer the current on-chain facts over UI copy or roadmap assumptions.

## Glossary
- `Vault`: an `AgentSafe` instance that holds funds and executes validated actions
- `KeyManager`: the LSP6 contract that checks controller permissions before forwarding execution
- `PolicyEngine`: the contract that validates every active policy before the safe executes
- `Policy`: an on-chain rule such as budget, merchant, expiry, or shared-budget enforcement
- `AgentCoordinator`: agent registry plus role, capability, and delegation metadata layer
- `SharedBudgetPool`: hierarchical pool accounting for multi-vault budgets
- `VaultDirectory`: metadata registry for vault labels and graph relationships
- `TaskScheduler`: on-chain schedule store for recurring or delayed executions
- `Keeper`: off-chain process that polls and triggers eligible tasks