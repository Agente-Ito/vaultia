# Vault Policy Stress Test Report

This report documents executable stress tests for vault policy enforcement.

## Scope

The test exercises the real path:

- `AgentVaultRegistry.deployVault(...)`
- `AgentSafe`
- `LSP6KeyManager.execute(...)`
- `PolicyEngine`
- `BudgetPolicy`
- `MerchantPolicy`
- `RecipientBudgetPolicy`

The coverage is implemented in:

- [test/VaultPolicyStress.test.ts](/Users/antonio/agent-vault-protocol/test/VaultPolicyStress.test.ts) for native LYX vaults
- [test/VaultPolicyStressLSP7.test.ts](/Users/antonio/agent-vault-protocol/test/VaultPolicyStressLSP7.test.ts) for LSP7-denominated vaults
- [test/VaultPolicyStressRandomized.test.ts](/Users/antonio/agent-vault-protocol/test/VaultPolicyStressRandomized.test.ts) for a deterministic randomized matrix
- [scripts/liveVaultPolicyStress.ts](/Users/antonio/agent-vault-protocol/scripts/liveVaultPolicyStress.ts) for a live LUKSO testnet runbook script

## Scenario Setup

Each test deploys a fresh vault with:

- Vault budget: `5 LYX` weekly
- One agent with `STRICT_PAYMENTS` permissions
- `AllowedCalls` opened for three addresses so KeyManager does not mask policy failures
- Merchant whitelist:
  - `merchant`
  - `limitedRecipient`
- Recipient rules:
  - `merchant`: whitelist-only, uncapped (`limit = 0`)
  - `limitedRecipient`: capped at `2 LYX / week`
  - `outsider`: not whitelisted

This matters because the policy stack is conjunctive:

- `MerchantPolicy` and `RecipientBudgetPolicy` are both enforced
- A recipient with an individual cap must also be merchant-whitelisted to pass

## Executed Checks

1. Repeated allowed payments succeed and spend is tracked exactly.
2. A payment above the per-recipient cap reverts with `RBP: recipient limit exceeded`.
3. A payment to an address permitted by `AllowedCalls` but missing from the vault whitelist reverts with `MP: merchant not whitelisted`.
4. Mixed valid payouts still stop at the global vault budget ceiling with `BP: budget exceeded`.
5. After the weekly boundary, recipient spend resets lazily and capacity becomes available again.

## Command

```bash
npx hardhat test test/VaultPolicyStress.test.ts
```

Additional local commands:

```bash
npx hardhat test test/VaultPolicyStressLSP7.test.ts
npx hardhat test test/VaultPolicyStressRandomized.test.ts
```

Live testnet script command:

```bash
npx hardhat run scripts/liveVaultPolicyStress.ts --network luksoTestnet
```

## Expected Outcome

The suite should pass cleanly and prove the following invariants:

- Failed executions do not advance `BudgetPolicy.spent`
- Failed executions do not advance recipient-specific `spent`
- Recipient caps are enforced independently of the vault-wide cap
- Merchant whitelist enforcement remains active even when KeyManager `AllowedCalls` would otherwise permit the call
- Period rollover restores recipient capacity without redeploying the vault

## Observed Result

Executed locally with:

```bash
npx hardhat test test/VaultPolicyStress.test.ts
```

Observed output summary:

```text
Vault policy stress — end to end
  5 passing (1s)
```

Validated behaviors from the passing run:

- Repeated allowed payouts reached the exact recipient cap and updated both vault and recipient spend counters.
- A payout above the recipient cap reverted without mutating accounting.
- A payout to an outsider reverted even though KeyManager `AllowedCalls` included that address.
- Mixed valid payouts consumed the full vault budget and the next payout reverted at the vault ceiling.
- After advancing one weekly period, the capped recipient could receive funds again.

## Additional Coverage

### LSP7-denominated vault stress

The LSP7 suite mirrors the same policy stack but uses a token-denominated vault and real LSP7 transfer calldata through `LSP6KeyManager.execute(...)`.

Validated behaviors:

- Repeated LSP7 transfers to a capped recipient succeed up to the cap.
- Additional LSP7 transfers above the cap revert with `RBP: recipient limit exceeded`.
- LSP7 transfers to an outsider revert with `MP: merchant not whitelisted`.
- The token vault-wide budget is enforced with `BP: budget exceeded`.
- Native LYX transfer attempts from a token-denominated vault revert with `BP: wrong denomination`.
- After the weekly boundary, recipient token capacity resets.

Observed local result:

```text
Vault policy stress — LSP7 end to end
  6 passing (1s)
```

### Deterministic randomized matrix

The randomized suite executes a seeded sequence of 24 payment attempts across:

- a whitelist-only merchant
- a capped recipient
- an outsider

Each attempt checks the first-failing policy in deployed order:

1. `BudgetPolicy`
2. `MerchantPolicy`
3. `RecipientBudgetPolicy`

After every attempt, the suite asserts that on-chain spend counters match the modelled state exactly.

This gives broader invariant coverage than a few hand-picked examples while remaining fully reproducible.

Observed local result:

```text
Vault policy stress — randomized matrix
  1 passing (884ms)
```

### Live LUKSO testnet script

The live script is intentionally documented but was not executed automatically in this session.

It performs:

1. real vault deployment through the current registry
2. ownership acceptance and vault funding
3. one successful limited-recipient payment
4. static-call confirmation of recipient-cap failure
5. static-call confirmation of outsider rejection
6. one successful merchant payment to consume the remaining vault budget
7. static-call confirmation of vault-budget failure

Safety notes:

- The script creates live on-chain state and spends real testnet gas.
- Failed cases are checked with `staticCall` so they do not burn gas.
- Override recipients with `.env` values if you do not want to use the default placeholder addresses:
  - `LIVE_STRESS_MERCHANT`
  - `LIVE_STRESS_LIMITED_RECIPIENT`
  - `LIVE_STRESS_OUTSIDER`
- The script writes a deployment artifact to `deployments/live-stress-<chainId>.json`.
- Status in this session: implemented and editor-clean, but intentionally not executed to avoid creating extra live testnet state without explicit approval.

## Notes

- The suite is intentionally end-to-end, not a unit mock. It uses the same deployment and permission path the product uses in practice.
- `AllowedCalls` deliberately includes the outsider address to prove the rejection comes from vault policy, not from LSP6 prefiltering.
- Hardhat emitted a tooling warning about Node `v18.20.5` not being officially supported, but the suite completed successfully with exit code `0`.
- Build/dev note from validation work: avoid running `next dev` and `next build` against the same `.next` directory at the same time, or build output may become inconsistent.
