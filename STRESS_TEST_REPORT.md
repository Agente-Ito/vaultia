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
- [scripts/liveVaultPolicyStressLSP7.ts](/Users/antonio/agent-vault-protocol/scripts/liveVaultPolicyStressLSP7.ts) for a live LUKSO testnet LSP7-denominated runbook script

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
npx hardhat run scripts/liveVaultPolicyStressLSP7.ts --network luksoTestnet
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

The live script was executed successfully in this session.

It performs:

1. real vault deployment through the current registry
2. ownership acceptance when required by the deployed stack, then vault funding
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

Observed live artifact:

- [deployments/live-stress-4201.json](/Users/antonio/agent-vault-protocol/deployments/live-stress-4201.json)

Observed live run configuration:

- Network: `luksoTestnet`
- Chain ID: `4201`
- Configured vault budget: `1.0 LYX`
- Configured recipient cap: `0.3 LYX`
- Vault funding amount: `1.1 LYX`
- Successful limited-recipient payment: `0.3 LYX`
- Successful merchant budget-fill payment: `0.7 LYX`

Observed live contract addresses:

- Registry: [0x8EE9858A68C4e344A949B8AE530bf9800F19B381](https://explorer.testnet.lukso.network/address/0x8EE9858A68C4e344A949B8AE530bf9800F19B381)
- Safe: [0x373569085e2FF22496126AAbcd2685F906F0e3FB](https://explorer.testnet.lukso.network/address/0x373569085e2FF22496126AAbcd2685F906F0e3FB)
- KeyManager: [0xa1a57F2dC3A07a371dA839C74cD078E7f67Fd9ea](https://explorer.testnet.lukso.network/address/0xa1a57F2dC3A07a371dA839C74cD078E7f67Fd9ea)
- PolicyEngine: [0x72cD57B4D6559E525cE547189B9FF68d9F7D19D6](https://explorer.testnet.lukso.network/address/0x72cD57B4D6559E525cE547189B9FF68d9F7D19D6)
- Operator / merchant: [0x859722730e0FE001962202d53d5c7b11e8327421](https://explorer.testnet.lukso.network/address/0x859722730e0FE001962202d53d5c7b11e8327421)
- Limited recipient: [0x1000000000000000000000000000000000000001](https://explorer.testnet.lukso.network/address/0x1000000000000000000000000000000000000001)
- Outsider: [0x2000000000000000000000000000000000000002](https://explorer.testnet.lukso.network/address/0x2000000000000000000000000000000000000002)

Observed live transaction hashes:

- `deployVault`: [0x5436fa7152ca15a545c55e7c2d8d487bf734f047a590bdc346f55461cfa28741](https://explorer.testnet.lukso.network/tx/0x5436fa7152ca15a545c55e7c2d8d487bf734f047a590bdc346f55461cfa28741)
- `acceptSafeOwnership`: [0x5f720cedf418ad0a3ed8daae869b50104f41f518782014f0e666b6777f9450c4](https://explorer.testnet.lukso.network/tx/0x5f720cedf418ad0a3ed8daae869b50104f41f518782014f0e666b6777f9450c4)
- `acceptPolicyEngineOwnership`: [0x1caf72ca73890326768a44cac21fe71ee5c382c68b0950f485e8edc978ca86fa](https://explorer.testnet.lukso.network/tx/0x1caf72ca73890326768a44cac21fe71ee5c382c68b0950f485e8edc978ca86fa)
- `fundVault`: [0x292f32457275303bd85a9bfbfd85af42a25c8aab78236a2fbbe1beabf65b01b1](https://explorer.testnet.lukso.network/tx/0x292f32457275303bd85a9bfbfd85af42a25c8aab78236a2fbbe1beabf65b01b1)
- `limitedRecipientPayment`: [0x5b4843924936dbeb570b8e6d3614eb229dc5c6b8d14c6f79f1e8e5fec56bfdf8](https://explorer.testnet.lukso.network/tx/0x5b4843924936dbeb570b8e6d3614eb229dc5c6b8d14c6f79f1e8e5fec56bfdf8)
- `merchantBudgetFillPayment`: [0x9a43603ec0134cffec39ee87b721f73d7a0337af321ca9c1e49e1726f20f3052](https://explorer.testnet.lukso.network/tx/0x9a43603ec0134cffec39ee87b721f73d7a0337af321ca9c1e49e1726f20f3052)

Observed live static checks:

- Recipient over-limit: expected `RBP: recipient limit exceeded`, validated via `staticCall`, so no transaction hash exists.
- Outsider payment: expected `MP: merchant not whitelisted`, validated via `staticCall`, so no transaction hash exists.
- Vault budget exceeded: expected `BP: budget exceeded`, validated via `staticCall`, so no transaction hash exists.

Observed live result summary:

Current live ownership observation:

- The current live LUKSO testnet registry now creates a full LSP14 two-step ownership stack.
- `AgentSafe` is deployed with `pendingOwner = operator` and needs `acceptOwnership()`.
- `PolicyEngine` is deployed with `pendingOwner = operator` and needs `acceptOwnership()`.
- The deployed policies are also created with `pendingOwner = operator` and each need `acceptOwnership()`.

```text
[1/4] Successful limited recipient payment...
  Success: 0.3 LYX sent to limited recipient

[2/4] Over-limit recipient attempt via static call...
  Expected revert confirmed for recipient over-limit: RBP: recipient limit exceeded

[3/4] Outsider attempt via static call...
  Expected revert confirmed for outsider payment: MP: merchant not whitelisted

[4/4] Vault ceiling check...
  Expected revert confirmed for vault budget exceeded: BP: budget exceeded
```

### Live LUKSO testnet LSP7 script

The LSP7 live script was also executed successfully in this session.

It performs:

1. real token-denominated vault deployment through the current registry
2. ownership acceptance when required by the deployed stack
3. public mint of demo LSP7 tokens into the vault
4. small LYX seed into the vault only to prove the wrong-denomination rejection reaches policy validation
5. one successful capped-recipient LSP7 payment
6. static-call confirmation of recipient-cap failure
7. static-call confirmation of outsider rejection
8. one successful merchant LSP7 payment to consume the remaining token budget
9. static-call confirmation of token budget failure
10. static-call confirmation that a native transfer from the token-denominated vault reverts with `BP: wrong denomination`

Observed live artifact:

- [deployments/live-stress-lsp7-4201.json](/Users/antonio/agent-vault-protocol/deployments/live-stress-lsp7-4201.json)

Observed live LSP7 run configuration:

- Network: `luksoTestnet`
- Chain ID: `4201`
- Demo token: [0x1611f48aAFE636EaFb12ac3cccE3D21Dd2B86B7E](https://explorer.testnet.lukso.network/address/0x1611f48aAFE636EaFb12ac3cccE3D21Dd2B86B7E)
- Configured token budget: `1.0`
- Configured recipient cap: `0.3`
- Token mint amount into vault: `1.1`
- LYX seed amount into vault: `0.2`
- Successful limited-recipient token payment: `0.3`
- Successful merchant budget-fill token payment: `0.7`

Observed live LSP7 contract addresses:

- Registry: [0x8EE9858A68C4e344A949B8AE530bf9800F19B381](https://explorer.testnet.lukso.network/address/0x8EE9858A68C4e344A949B8AE530bf9800F19B381)
- Safe: [0xDD39b21C9F7Ae994CaE57eE33D38b9F12E0c1132](https://explorer.testnet.lukso.network/address/0xDD39b21C9F7Ae994CaE57eE33D38b9F12E0c1132)
- KeyManager: [0x6E604648C7A9fe6186D8754ffE58DAE9464cF4Ab](https://explorer.testnet.lukso.network/address/0x6E604648C7A9fe6186D8754ffE58DAE9464cF4Ab)
- PolicyEngine: [0x5072fDb0d70919d82e0316E1241Aa0151428F961](https://explorer.testnet.lukso.network/address/0x5072fDb0d70919d82e0316E1241Aa0151428F961)
- Operator / merchant: [0x859722730e0FE001962202d53d5c7b11e8327421](https://explorer.testnet.lukso.network/address/0x859722730e0FE001962202d53d5c7b11e8327421)
- Limited recipient: [0x1000000000000000000000000000000000000001](https://explorer.testnet.lukso.network/address/0x1000000000000000000000000000000000000001)
- Outsider: [0x2000000000000000000000000000000000000002](https://explorer.testnet.lukso.network/address/0x2000000000000000000000000000000000000002)

Observed live LSP7 transaction hashes:

- `deployVault`: [0x57bfb45c9c6ded2e32c283a1647c92b8f2390e114360cb02184d2edee08eb300](https://explorer.testnet.lukso.network/tx/0x57bfb45c9c6ded2e32c283a1647c92b8f2390e114360cb02184d2edee08eb300)
- `acceptSafeOwnership`: [0x9e12aeb1a756a2555525a8bc14788b3ef3f39a75a176c1c133ff832c7ef683b0](https://explorer.testnet.lukso.network/tx/0x9e12aeb1a756a2555525a8bc14788b3ef3f39a75a176c1c133ff832c7ef683b0)
- `acceptPolicyEngineOwnership`: [0x310ed6ba563d0c3d30768a94c9884fd0f57b8ba0ce200759563cc03ef12b3c95](https://explorer.testnet.lukso.network/tx/0x310ed6ba563d0c3d30768a94c9884fd0f57b8ba0ce200759563cc03ef12b3c95)
- `mintTokenToVault`: [0x712455a7c6a149d5825ab84909ab18f7632825ecc5ea077068d319b50001e19b](https://explorer.testnet.lukso.network/tx/0x712455a7c6a149d5825ab84909ab18f7632825ecc5ea077068d319b50001e19b)
- `seedVaultLyx`: [0x809ba719cb0de2743dbb6a3c6b3ab71fc514e38df20956945e591095d1bbe684](https://explorer.testnet.lukso.network/tx/0x809ba719cb0de2743dbb6a3c6b3ab71fc514e38df20956945e591095d1bbe684)
- `limitedRecipientPayment`: [0x30bf77e02777d83928c330bcc9aa46e052e6dcd4b5bff53ac87a965aaa1d7f0e](https://explorer.testnet.lukso.network/tx/0x30bf77e02777d83928c330bcc9aa46e052e6dcd4b5bff53ac87a965aaa1d7f0e)
- `merchantBudgetFillPayment`: [0x4181b44a2b44b7c69366288bb8ac766e54dad00fc960c3e2f74ce3e885e57747](https://explorer.testnet.lukso.network/tx/0x4181b44a2b44b7c69366288bb8ac766e54dad00fc960c3e2f74ce3e885e57747)

Observed live LSP7 static checks:

- Recipient over-limit: expected `RBP: recipient limit exceeded`, validated via `staticCall`, so no transaction hash exists.
- Outsider payment: expected `MP: merchant not whitelisted`, validated via `staticCall`, so no transaction hash exists.
- Vault budget exceeded: expected `BP: budget exceeded`, validated via `staticCall`, so no transaction hash exists.
- Wrong denomination: expected `BP: wrong denomination`, validated via `staticCall`, so no transaction hash exists.

Observed live LSP7 result summary:

Current live LSP7 ownership observation:

- The current live LUKSO testnet registry also creates a full LSP14 two-step ownership stack for token-denominated vaults.
- `AgentSafe` required `acceptOwnership()` in the validated run.
- `PolicyEngine` also required `acceptOwnership()`.
- Each deployed policy also required `acceptOwnership()`.

```text
[1/5] Successful limited recipient token payment...
  Success: 0.3 tokens sent to limited recipient

[2/5] Over-limit recipient attempt via static call...
  Expected revert confirmed for recipient over-limit: RBP: recipient limit exceeded

[3/5] Outsider token attempt via static call...
  Expected revert confirmed for outsider payment: MP: merchant not whitelisted

[4/5] Successful merchant token payment to fill budget...
  Success: 0.7 tokens sent to merchant

[5/5] Token budget and denomination checks...
  Expected revert confirmed for vault budget exceeded: BP: budget exceeded
  Expected revert confirmed for wrong denomination: BP: wrong denomination
```

## Notes

- The suite is intentionally end-to-end, not a unit mock. It uses the same deployment and permission path the product uses in practice.
- `AllowedCalls` deliberately includes the outsider address to prove the rejection comes from vault policy, not from LSP6 prefiltering.
- Hardhat emitted a tooling warning about Node `v18.20.5` not being officially supported, but the suite completed successfully with exit code `0`.
- Build/dev note from validation work: avoid running `next dev` and `next build` against the same `.next` directory at the same time, or build output may become inconsistent.

## Live Automation Proof

This section records a live recurring-payment execution through the new LUKSO testnet `TaskScheduler` plus the off-chain keeper.

Observed live artifact:

- [deployments/live-automation-4201.json](/Users/antonio/agent-vault-protocol/deployments/live-automation-4201.json)

Validated live automation flow:

1. the demo vault owner authorized `TaskScheduler` in the vault permission store
2. a recurring TIMESTAMP task was created for `0.01 LYX` every `120` seconds
3. the keeper process polled `getEligibleTasks()` and submitted `executeTask(taskId)` when the task became eligible
4. the vault paid from its own balance through `TaskScheduler -> LSP6KeyManager -> AgentSafe.execute(...)`
5. the task remained enabled and its `nextExecution` advanced after each successful run

Observed live automation addresses:

- Scheduler: [0x2975aDc7F8d8e323897e3849869C8CC23Ed89392](https://explorer.testnet.lukso.network/address/0x2975aDc7F8d8e323897e3849869C8CC23Ed89392)
- Registry: [0x8EE9858A68C4e344A949B8AE530bf9800F19B381](https://explorer.testnet.lukso.network/address/0x8EE9858A68C4e344A949B8AE530bf9800F19B381)
- Vault: [0x814df0Acbe6FC01D5cFe5a179bf86a2E00cd0447](https://explorer.testnet.lukso.network/address/0x814df0Acbe6FC01D5cFe5a179bf86a2E00cd0447)
- KeyManager: [0xFd8dd1631e3eB91943dCd192a026D0Ccc7D0A458](https://explorer.testnet.lukso.network/address/0xFd8dd1631e3eB91943dCd192a026D0Ccc7D0A458)
- Keeper / merchant: [0x859722730e0FE001962202d53d5c7b11e8327421](https://explorer.testnet.lukso.network/address/0x859722730e0FE001962202d53d5c7b11e8327421)
- Task ID: `0x85e63639109b6728bf82246642eb47af81c302a2c195a0a56f00e8a0c20548b9`

Observed live task lifecycle transactions:

- `TaskCreated`: [0xad6a6aa489dea4694b30ec1e6defd0e360c43565afb6aa266936bb753afb69b1](https://explorer.testnet.lukso.network/tx/0xad6a6aa489dea4694b30ec1e6defd0e360c43565afb6aa266936bb753afb69b1)
- `TaskExecuted #1`: [0x6d7606d37f5675daea4e7a91bb2745a1d8beb8d4907eb4017f801034a7596f23](https://explorer.testnet.lukso.network/tx/0x6d7606d37f5675daea4e7a91bb2745a1d8beb8d4907eb4017f801034a7596f23)
- `TaskExecuted #2`: [0x30baf499e2e3f036d50630dde5bac8e792f1e0e36a07645c308ccf40451e4682](https://explorer.testnet.lukso.network/tx/0x30baf499e2e3f036d50630dde5bac8e792f1e0e36a07645c308ccf40451e4682)
- `TaskUpdated`: [0x65bda8ce49e9a60fe236e763f484a5be38981e66529f0e57e287a93196f6f02a](https://explorer.testnet.lukso.network/tx/0x65bda8ce49e9a60fe236e763f484a5be38981e66529f0e57e287a93196f6f02a)
- `TaskExecuted #3` after keeper fix: [0x805eee51325c1d526c34ddba93830858c1f30eba35d9c7b17da60b9777a8784a](https://explorer.testnet.lukso.network/tx/0x805eee51325c1d526c34ddba93830858c1f30eba35d9c7b17da60b9777a8784a)

Observed schedule progression:

- Initial first execution at creation: `2026-03-22T07:48:43.000Z`
- After execution #1: `nextExecution = 2026-03-22T07:50:43.000Z`
- After execution #2: `nextExecution = 2026-03-22T07:52:43.000Z`
- Manual test update: `nextExecution = 2026-03-22T07:52:51.000Z`
- After execution #3: `nextExecution = 2026-03-22T07:54:51.000Z`

Observed balance effect:

- Vault balance before recurring automation: `1.0 LYX`
- Amount per automated execution: `0.01 LYX`
- Successful executions observed: `3`
- Vault balance after the observed executions: `0.97 LYX`

Operational note:

- The first live keeper run exposed a race in [runner/keeper.js](/Users/antonio/agent-vault-protocol/runner/keeper.js): overlapping `setInterval` ticks could submit duplicate `executeTask` attempts while a prior transaction was still pending.
- The keeper was updated to serialize polling ticks with an in-flight guard.
- The third execution hash above is the clean post-fix proof that the recurring payment path works without overlapping submissions.
