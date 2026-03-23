# Private Agents / Trusted Actions

## Submission Angle

Vaultia is strongest in this track when framed as trusted, minimally delegated execution rather than confidential compute. The agent can perform sensitive actions under granular permissions, while the execution result remains publicly verifiable.

## Why It Fits

- Execution is scoped through KeyManager and vault permissions.
- The user does not expose unrestricted wallet authority.
- Sensitive actions route through an enforceable policy path.
- Public receipts can prove what happened without exposing every off-chain decision detail.

## Demo Flow

1. Show the user granting only the minimum authority needed.
2. Trigger a valid trusted action.
3. Attempt the same action outside scope and show it blocked.
4. Show the public proof in activity.

## Evidence

- [contracts/AgentSafe.sol](../contracts/AgentSafe.sol)
- [contracts/PolicyEngine.sol](../contracts/PolicyEngine.sol)
- [frontend-next/src/lib/web3/deployVault.ts](../frontend-next/src/lib/web3/deployVault.ts)
- [frontend-next/src/components/vaults/SendPaymentModal.tsx](../frontend-next/src/components/vaults/SendPaymentModal.tsx)
- [frontend-next/src/app/(app)/activity/page.tsx](../frontend-next/src/app/(app)/activity/page.tsx)

## Honest Caveat

- Vaultia is not currently a TEE or zero-knowledge privacy system.
- The better wording is trusted actions with scoped permissions and public verifiable outcomes.
