# LUKSO Testnet Redeploy Checklist

This checklist was used to migrate the live LUKSO testnet deployment from the mixed ownership stack to the repository's current LSP14-aligned infrastructure.

## Goal

Replace the current live LUKSO testnet infrastructure so that new vaults created through the registry use the current repository code and no longer inherit the older helper-contract behavior.

Target outcome:

- a freshly deployed vault on testnet reflects the current repository behavior
- frontend and scripts can continue using conditional ownership acceptance safely
- the public registry address and related frontend environment are updated in a controlled way

## Current Live State

Current live registry:

- `AgentVaultRegistry`: `0x8EE9858A68C4e344A949B8AE530bf9800F19B381`

Current helper contracts behind that registry:

- `core()`: `0x10555F4f0EC5853223b4613d92ec27efe8A9F6C7`
- `deployer()`: `0x88490Dd3Be671ef1c2d28f94825F86ba55E436C9`
- `optionalDeployer()`: `0x12aC7Ef380FD7caBFBedD3F282ebde0d2814a480`
- `kmDeployer()`: `0x3de306e0488A3cc8CE50B0b0Df1AdcB2EAa435B0`

Observed consequence on fresh live vaults today:

- `AgentSafe`: pending-owner flow, needs `acceptOwnership()`
- `PolicyEngine`: pending-owner flow, needs `acceptOwnership()`
- deployed policies: pending-owner flow, each needs `acceptOwnership()`

## Scope Of Redeploy

Contracts that must be redeployed together:

1. `MerchantRegistry`
2. `AgentVaultDeployerCore`
3. `AgentVaultDeployer`
4. `AgentVaultOptionalPolicyDeployer`
5. `AgentKMDeployer`
6. `TaskScheduler`
7. `AgentCoordinator`
8. `SharedBudgetPool`
9. `AgentVaultRegistry`

Operational note:

- this is effectively a fresh protocol stack deployment, not an in-place upgrade
- existing vaults deployed from the old registry remain valid on-chain but will continue to reflect the old ownership behavior

## Preconditions

Before any live redeploy:

1. Confirm the deployer wallet is the intended long-term admin for the new testnet stack.
2. Confirm enough LYX is available for:
   - protocol contract deployment
   - post-deploy authorization wiring
   - demo vault deployment in `scripts/deploy.ts`
   - any follow-up validation runs
3. Confirm `.env` contains the intended `PRIVATE_KEY` and `LUKSO_TESTNET_RPC`.
4. Confirm the local branch includes the current LSP14 migration changes.
5. Confirm frontend deployment access so `NEXT_PUBLIC_REGISTRY_ADDRESS` can be updated after the redeploy.
6. Confirm whether the current live registry address is referenced anywhere external to this repo.

## Pre-Redeploy Validation

Run these locally before touching testnet:

```bash
npm run compile
npm test
npm --prefix frontend-next run build
```

Recommended targeted checks:

```bash
npx hardhat test test/Registry.integration.test.ts
npx hardhat test test/RecipientBudgetPolicy.test.ts
npx hardhat test test/AgentBudgetPolicy.test.ts
npx hardhat test test/Permissions.e2e.test.ts
```

Recommended live dry-run diagnostics:

```bash
DEBUG_DEPLOY_MODE=native npx hardhat run scripts/debugDeployVault.ts --network luksoTestnet
DEBUG_DEPLOY_MODE=lsp7 LIVE_STRESS_LSP7_TOKEN=0x1611f48aAFE636EaFb12ac3cccE3D21Dd2B86B7E npx hardhat run scripts/debugDeployVault.ts --network luksoTestnet
```

## Execution Steps

### Phase A: Snapshot Current State

Capture and keep:

1. current `.env`
2. current frontend `.env.local`
3. current deployment artifact:
   - `deployments/lukso-testnet-4201.json`
4. current live verification artifacts:
   - `deployments/live-stress-4201.json`
   - `deployments/live-stress-lsp7-4201.json`
5. current registry/helper addresses from the old stack

### Phase B: Redeploy Infrastructure

Run:

```bash
npx hardhat run scripts/deploy.ts --network luksoTestnet
```

Expected effects:

1. deploys new helper contracts and a new registry
2. wires `AgentCoordinator` and `SharedBudgetPool` authorizations
3. deploys a demo vault through the new registry
4. updates root `.env`
5. writes a fresh `deployments/lukso-testnet-4201.json`

### Phase C: Record New Canonical Addresses

From the deployment output, capture:

1. `REGISTRY_ADDRESS`
2. `MERCHANT_REGISTRY_ADDRESS`
3. `COORDINATOR_ADDRESS`
4. `TASK_SCHEDULER_ADDRESS`
5. `AGENT_SAFE_ADDRESS`
6. `KEY_MANAGER_ADDRESS`
7. `POLICY_ENGINE_ADDRESS`
8. helper contract addresses shown by the deploy script

### Phase D: Validate New Stack Behavior

Run fresh end-to-end validations against the newly deployed stack:

```bash
npx hardhat run scripts/liveVaultPolicyStress.ts --network luksoTestnet
npx hardhat run scripts/liveVaultPolicyStressLSP7.ts --network luksoTestnet
```

Confirm from artifacts and logs:

1. fresh vaults deploy successfully
2. ownership acceptance logic behaves as expected for the new live stack
3. native and LSP7 payment validations still pass
4. artifacts are rewritten with the new registry and vault addresses

### Phase E: Update Frontend / Ops Configuration

Update or verify:

1. root `.env`
2. `frontend-next/.env.local`
3. any Vercel or hosted frontend env vars using `NEXT_PUBLIC_REGISTRY_ADDRESS`
4. any external bots or scripts that read:
   - `REGISTRY_ADDRESS`
   - `TASK_SCHEDULER_ADDRESS`
   - `COORDINATOR_ADDRESS`

## Expected User-Facing Impact

### Existing vaults

- No automatic migration happens.
- Existing vaults remain on-chain and usable.
- Existing vaults keep the ownership behavior of the stack they were deployed from.

### New vaults

- New vaults created after the frontend is pointed to the new registry will use the new infrastructure.
- Ownership behavior should be validated again immediately after redeploy; do not assume parity until the live runbooks confirm it.

### Frontend

- The UI currently uses conditional ownership acceptance wording and logic.
- This is safe for both the current mixed stack and a fully migrated stack.
- After redeploy, only the configured registry address should need to change unless a separate frontend bug is discovered.

## Risks

1. The deploy script updates `.env` automatically, so stale values can be overwritten.
2. The new registry address will not control old vaults.
3. Any external integrations pinned to the old registry must be updated manually.
4. If the redeploy partially succeeds, helper contracts may exist without the frontend being switched to the new registry.

## Rollback Plan

Rollback is configuration rollback, not contract rollback.

If post-redeploy validation fails:

1. restore previous `REGISTRY_ADDRESS` in root `.env`
2. restore previous `NEXT_PUBLIC_REGISTRY_ADDRESS` in frontend env
3. restore or re-publish previous frontend configuration
4. keep the failed redeploy addresses recorded for forensic comparison

Important:

- already-deployed new contracts remain on-chain
- rollback means pointing apps and ops back to the old registry, not deleting the new deployment

## Go / No-Go Criteria For Step 1

Proceed with the live redeploy only if all are true:

1. local compile passes
2. targeted tests pass
3. frontend build passes
4. deployer wallet and RPC are correct
5. there is a clear plan to update frontend env vars immediately after deployment
6. we accept that existing vaults will remain associated with the old registry lineage

## Immediate Post-Redeploy Verification Checklist

After the redeploy, verify in this order:

1. new registry/helper addresses are written to `deployments/lukso-testnet-4201.json`
2. `AgentCoordinator` authorizes the new registry
3. `SharedBudgetPool` authorizes the new registry
4. `scripts/debugDeployVault.ts` succeeds in native mode with broadcast off
5. `scripts/liveVaultPolicyStress.ts` completes successfully
6. `scripts/liveVaultPolicyStressLSP7.ts` completes successfully
7. frontend points to the new registry and still builds cleanly
