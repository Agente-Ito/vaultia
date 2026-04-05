# Multisig Widget Activation Proposal

## Goal

Make vault creation with multisig work reliably in a standalone widget, especially for
LUKSO Universal Profile users going through the relayer path.

The current one-shot flow is elegant on paper but too heavy in practice:

1. Deploy base vault stack
2. Deploy multisig controller
3. Write ERC725Y metadata
4. Write LSP6 permissions for multisig
5. Transfer ownership of the full stack

For EOAs this is acceptable. For UP relayer flows it is too large and fails before broadcast.

## Recommendation

Do not optimize for a single transaction.

Optimize for a single widget experience with staged activation:

1. Create vault base stack
2. Enable multisig as a second step
3. Accept ownership as a final step

From the user's perspective, this is still one guided setup flow.
From the chain's perspective, it becomes 2-3 smaller transactions instead of one oversized one.

## Why This Fits The Current Protocol

The registry already keeps the intended owner separate from the current owner during LSP14 transfer.

During `deployVault(...)`:

- the registry deploys and configures the stack
- the registry calls `transferOwnership(owner)` on the safe, policy engine, and policies
- the user becomes `pendingOwner`
- the registry is still the current owner until `acceptOwnership()` happens

This means there is a clean intermediate window where:

- the user is already the designated owner for the vault
- the registry still has the authority to finish configuration
- ownership can be accepted only after the final setup step completes

This window is the ideal place to install multisig.

## Proposed Contract API

Add a dedicated registry function for post-deploy multisig activation:

```solidity
function enableMultisig(
    address safe,
    address[] calldata signers,
    uint256 threshold,
    uint256 timeLock
) external returns (address multisig);
```

### Authorization Model

The function should be callable by the designated vault owner, not by the current on-chain owner.

Recommended checks:

```solidity
require(safe != address(0), "Registry: zero safe");
require(signers.length > 0, "Registry: no signers");
require(safeToOwner[safe] == msg.sender, "Registry: not designated owner");
require(safeToMultisigController[safe] == address(0), "Registry: multisig already set");
require(IPendingOwnable(safe).pendingOwner() == msg.sender, "Registry: safe not pending to caller");
require(IPendingOwnable(safeToPolicyEngine[safe]).pendingOwner() == msg.sender, "Registry: PE not pending to caller");
```

Important implication:

- `enableMultisig(...)` is intentionally a pre-acceptance step.
- If the user already accepted ownership, this helper should revert.
- That keeps the implementation simple and widget-friendly.

For already-owned vaults, a separate advanced flow can exist later.

## Proposed Internal Behavior

`enableMultisig(...)` should reuse the same logic already present in the deploy path.

Suggested internal sequence:

1. Resolve the safe's key manager from `safeToKeyManager[safe]`
2. Deploy `MultisigController` through `msDeployer.newMultisigController(...)`
3. Write `AVP_MULTISIG` into safe ERC725Y storage
4. Write LSP6 permissions for the multisig controller
5. Append the multisig controller to `AddressPermissions[]`
6. Update registry mappings and `VaultRecord`
7. Emit a dedicated event

Suggested event:

```solidity
event MultisigEnabled(
    address indexed owner,
    address indexed safe,
    address indexed multisig,
    uint256 signerCount,
    uint256 threshold,
    uint256 timeLock
);
```

## Suggested Implementation Shape

To avoid code duplication, extract the current multisig branch from `_deployStack(...)`
into a reusable helper.

Suggested internal helper:

```solidity
function _installMultisig(
    IAgentSafe safe,
    address km,
    address[] memory signers,
    uint256 threshold,
    uint256 timeLock,
    uint128 apIdx
) internal returns (address multisig, uint128 nextApIdx)
```

Responsibilities of `_installMultisig(...)`:

- deploy the controller
- write `AVP_MULTISIG`
- write `PERM_POWER_USER`
- append to permissions array
- return the new controller address and updated `apIdx`

Then both flows can call it:

- `_deployStack(...)`
- `enableMultisig(...)`

This keeps behavior identical and auditable.

## Widget UX Flow

### Step 1: Create Vault

User configures:

- vault label
- merchants / recipients
- budget
- automation preferences
- optional "Protect with multisig" toggle

If multisig is enabled, the signer list is collected now, but not deployed yet.

Success state:

- "Vault created"
- not yet "fully protected"

### Step 2: Protect With Multisig

If the user selected multisig, the widget immediately transitions to:

- headline: `Protect this vault with multisig`
- summary of signer set
- threshold
- timelock
- CTA: `Enable multisig`

This sends the second transaction only.

Success state:

- multisig address shown
- badge: `Protection active`

### Step 3: Finalize Ownership

Last step:

- headline: `Finalize ownership`
- explain that the vault is configured but ownership still needs acceptance
- CTA: `Accept ownership`

If the user leaves here, the dashboard can show a recovery action later.

## Why This Is More Elegant Than One Huge Deploy

Because the widget remains self-contained while the chain interactions become reliable.

The user does not care whether the system used one transaction or three.
The user cares that:

- the process is understandable
- each signature screen is legible
- failures are recoverable
- the resulting vault is clearly protected

Staged activation is therefore more elegant in product terms than atomic deployment.

## Ownership Ordering

Best order for the widget:

1. `deployVault(...)` without multisig
2. `enableMultisig(...)`
3. `acceptOwnership()` on safe + PE + policies

This order has two advantages:

1. The registry still has authority to finish setup during step 2
2. The user only becomes final owner after the desired protection is installed

This mirrors account-abstraction onboarding patterns where security modules are added before final handoff.

## Gas Impact

### What Actually Improves

Splitting the flow does not reduce total gas dramatically.
It reduces per-transaction gas and relayer pressure.

That is the important metric for UP widgets.

The main win is:

- smaller transactions
- fewer operations inside a single relayed payload
- fewer chances that the relayer rejects the request before broadcast

### Largest Current Gas Consumers

1. Contract creation count inside one call
2. ERC725Y writes with read-back verification
3. LSP6 permission writes and array updates
4. Optional policy deployment branches
5. Multisig deployment and permission wiring in the same transaction

### Practical Optimization Ranking

1. Split deploy and multisig activation
2. Reuse a shared `_installMultisig(...)` helper instead of duplicating logic
3. Consider making `_setDataVerified(...)` optional in production mode if operationally acceptable
4. Avoid deploying optional policies unless explicitly required

## Optional Future Extension

If later you want already-owned vaults to adopt multisig, add a second path:

```solidity
function registerExistingMultisig(address safe, address multisig) external;
```

This already partially exists today as metadata registration, but a complete version would need:

- explicit validation that the multisig targets the correct safe and key manager
- proof that the safe already granted the proper LSP6 permissions
- safe ownership checks for post-acceptance installs

That is a valid advanced feature, but not the best first move for the widget.

## Recommendation Summary

For the widget-first roadmap:

1. Keep `deployVault(...)` lean
2. Add `enableMultisig(...)` to the registry
3. Treat ownership acceptance as the final step, not part of the initial deploy
4. Present the whole process as one guided setup experience

This gives the cleanest balance of:

- protocol integrity
- relayer compatibility
- understandable UX
- future extensibility