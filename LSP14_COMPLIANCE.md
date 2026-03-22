# LSP14 Compliance Matrix

This note records the current ownership-model status of the contracts in this repository against LSP14 Ownable2Step.

LSP14 requires, at minimum:

- `owner()`
- `pendingOwner()`
- `transferOwnership(address)` starting a 2-step flow
- `acceptOwnership()` callable by `pendingOwner()`
- `renounceOwnership()` under the LSP14 two-step renounce semantics
- the LSP14 interface and events

Interface reference:

- LSP14 interface id: `0x94be5999`

## Summary

- `AgentSafe` complies with LSP14 because it inherits `LSP9Vault`.
- `PolicyEngine` and the user-owned LUKSO policy contracts now comply with LSP14 via a shared ownership base.
- The LUKSO registry flow is now consistently two-step across the user-owned stack:
  - `AgentSafe`: 2-step ownership transfer via `LSP9Vault`
  - `PolicyEngine` and deployed policies: 2-step ownership transfer via `LSP14Ownable2Step`
- The Base user-owned stack is now also two-step for `BaseAgentVault`, `PolicyEngine`, `BudgetPolicy`, `MultiTokenBudgetPolicy`, and optional user-owned policies.
- Administrative factories and coordinators remain intentionally single-step.

## Important Deployment Note

The live LUKSO testnet infrastructure has now been refreshed to the repository's LSP14-aligned deployment model.

- Current live LUKSO testnet registry: `0x8EE9858A68C4e344A949B8AE530bf9800F19B381`
- Current helper contracts behind that registry:
  - `core() = 0x10555F4f0EC5853223b4613d92ec27efe8A9F6C7`
  - `deployer() = 0x88490Dd3Be671ef1c2d28f94825F86ba55E436C9`
  - `optionalDeployer() = 0x12aC7Ef380FD7caBFBedD3F282ebde0d2814a480`
  - `kmDeployer() = 0x3de306e0488A3cc8CE50B0b0Df1AdcB2EAa435B0`
- Fresh vaults created through the current live registry now deploy a full two-step user-owned stack on testnet:
  - `AgentSafe`: `pendingOwner = operator`, requires `acceptOwnership()`
  - `PolicyEngine`: `pendingOwner = operator`, requires `acceptOwnership()`
  - deployed policies: `pendingOwner = operator`, each requires `acceptOwnership()`

Operational consequence:

- frontend and scripts can still keep the conditional ownership finalization logic safely
- live behavior now matches the repository's intended full-stack LSP14 model

## Matrix

| Contract | Ownership base | LSP14 compliant | Notes |
| --- | --- | --- | --- |
| `AgentSafe` | `LSP9Vault` | Yes | Inherits LSP14 behavior via LSP9. Requires `acceptOwnership()` after `transferOwnership()`. |
| `PolicyEngine` | `LSP14Ownable2StepInit` | Yes | Two-step ownership with `pendingOwner()`, `acceptOwnership()`, and ERC165 LSP14 reporting. |
| `BudgetPolicy` | `LSP14Ownable2StepInit` | Yes | Two-step ownership. |
| `MerchantPolicy` | `LSP14Ownable2StepInit` | Yes | Two-step ownership. |
| `RecipientBudgetPolicy` | `LSP14Ownable2StepInit` | Yes | Two-step ownership. |
| `AgentBudgetPolicy` | `LSP14Ownable2StepInit` | Yes | Two-step ownership. |
| `ExpirationPolicy` | `LSP14Ownable2StepInit` | Yes | Two-step ownership. |
| `SharedBudgetPolicy` | `LSP14Ownable2StepInit` | Yes | Two-step ownership. |
| `BaseAgentVault` | `LSP14Ownable2StepInit` | Yes | Two-step ownership on Base-side smart account vaults. |
| `MultiTokenBudgetPolicy` | `LSP14Ownable2StepInit` | Yes | Two-step ownership for Base multi-token budgets. |
| `AgentVaultRegistry` | OpenZeppelin `Ownable` | No | Administrative factory, not part of the user-owned LSP14 flow. |
| `BaseVaultFactory` | OpenZeppelin `Ownable` | No | Administrative factory, single-step. |
| `TaskScheduler` | OpenZeppelin `Ownable` | No | Unrelated admin ownership, single-step. |
| `AgentCoordinator` | OpenZeppelin `Ownable` | No | Single-step. |
| `SharedBudgetPool` | OpenZeppelin `Ownable` | No | Single-step. |

## Evidence

### LSP14-compliant path

- `AgentSafe` inherits `LSP9Vault`.
- `LSP9VaultCore` implements `acceptOwnership()`, `renounceOwnership()`, and `supportsInterface(...)` for the LSP14 ownership flow.
- `PolicyEngine`, `BudgetPolicy`, `MerchantPolicy`, `RecipientBudgetPolicy`, `AgentBudgetPolicy`, `ExpirationPolicy`, and `SharedBudgetPolicy` now inherit the shared `LSP14Ownable2StepInit` base.
- `LSP14Ownable2StepInit` initializes ownership with `_setOwner(initialOwner)` and exposes ERC165 support for `type(ILSP14Ownable2Step).interfaceId`.
- `BaseAgentVault` and `MultiTokenBudgetPolicy` also now inherit `LSP14Ownable2StepInit`, so the Base user-owned stack follows the same pending-owner semantics.

### Non-compliant path

The following contracts are still based on OpenZeppelin `Ownable` and therefore do not expose the LSP14 flow:

## Practical interpretation for integrators

When a fresh LUKSO vault is deployed from the current repository code:

- The user must call `acceptOwnership()` on `AgentSafe`.
- The user must also call `acceptOwnership()` on `PolicyEngine`.
- The user must also call `acceptOwnership()` on every deployed policy contract in that vault stack.
- Until each acceptance is completed, the registry remains the current owner and the user is only `pendingOwner`.

When a vault is deployed through the currently configured live LUKSO testnet registry:

- The user must accept ownership on `AgentSafe`.
- The user must also accept ownership on `PolicyEngine`.
- The user must also accept ownership on every deployed policy contract in that stack.

## Minimal migration plan

### Goal

Make the whole user-owned LUKSO vault stack behave consistently under LSP14 instead of only the safe.

### Phase 1: clarify behavior without changing ABI

- Keep `AgentSafe` as the only LSP14 contract in the current stack.
- Fix comments, tests, and frontend assumptions so they do not imply that `PolicyEngine` is two-step.
- Status: completed.

### Phase 2: upgrade `PolicyEngine` to LSP14 semantics

- Replace OpenZeppelin `Ownable` in `PolicyEngine` with an LSP14-compatible ownership base.
- Required outcome:
  - `pendingOwner()` exists
  - `acceptOwnership()` finalizes ownership
  - ERC165 reports LSP14 support
- Registry flow after deploy:
  - `safe.transferOwnership(owner)`
  - `policyEngine.transferOwnership(owner)`
  - user explicitly accepts both where applicable
- Status: completed.

### Phase 3: upgrade policy contracts to the same model

- Migrate these contracts from OZ `Ownable` to an LSP14-compatible base:
  - `BudgetPolicy`
  - `MerchantPolicy`
  - `RecipientBudgetPolicy`
  - `AgentBudgetPolicy`
  - `ExpirationPolicy`
  - `SharedBudgetPolicy`
- This yields a consistent user-acceptance flow across the whole LUKSO vault stack.
- Status: completed.

### Phase 3b: refresh live LUKSO infrastructure

- Redeploy `AgentVaultDeployerCore`, `AgentVaultDeployer`, `AgentVaultOptionalPolicyDeployer`, `AgentKMDeployer`, and `AgentVaultRegistry` on the target live network from the migrated repository state.
- This redeploy has been completed on LUKSO testnet and validated with fresh native and LSP7 live stress runs.
- Status: completed on LUKSO testnet.

### Phase 4: decide whether Base should mirror LSP14

- If cross-chain UX consistency matters, migrate `BaseAgentVault` and the Base-side policy stack to a two-step ownership model too.
- If not, document Base as intentionally single-step and keep the difference explicit.
- Status: completed for `BaseAgentVault` and `MultiTokenBudgetPolicy`; Base admin factories remain intentionally single-step.

## Testing implications

Tests should now assert:

- `pendingOwner()` is set after deploy on `AgentSafe`, `PolicyEngine`, and every deployed LUKSO policy contract
- only the `pendingOwner()` can call `acceptOwnership()`
- ownership is not finalized until `acceptOwnership()` is executed
- payment execution still works while the user is `pendingOwner`, because operational paths do not rely on the user being the current owner immediately after deploy

Live-network validation should confirm that `pendingOwner()` is observed on the safe, policy engine, and each deployed policy for fresh vaults created from the current testnet registry.

The remaining non-LSP14 surface is the administrative layer (`AgentVaultRegistry`, `BaseVaultFactory`, `TaskScheduler`, `AgentCoordinator`, `SharedBudgetPool`), which is intentionally single-step.
