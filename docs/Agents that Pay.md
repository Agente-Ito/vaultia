# Agents that Pay

## Submission Angle

Vaultia enables agents to make payments without receiving raw wallet custody. Every payment must pass through Universal Profile, KeyManager, AgentSafe, and PolicyEngine constraints before execution.

## Why It Fits

- On-chain payment route is working on LUKSO testnet.
- Manual and automated payments use the same protected execution path.
- Payment policies are enforced on-chain, not just in UI.
- Recipient and budget failures are visible in the activity feed.

## Current Coverage

Implemented:

- on-chain testnet payments
- constrained recipients
- budget limits
- automation-triggered payments
- proof of successful and blocked executions

Not yet implemented:

- Stripe test sandbox route

## Demo Flow

1. Show the vault's allowed recipients.
2. Show the vault's available amount and cadence constraints.
3. Send a valid payment.
4. Attempt an invalid payment and show policy rejection.
5. Create a scheduled payment and show keeper execution.

## Evidence

- [contracts/AgentSafe.sol](../contracts/AgentSafe.sol)
- [contracts/PolicyEngine.sol](../contracts/PolicyEngine.sol)
- [contracts/policies/BudgetPolicy.sol](../contracts/policies/BudgetPolicy.sol)
- [contracts/policies/RecipientBudgetPolicy.sol](../contracts/policies/RecipientBudgetPolicy.sol)
- [contracts/automation/TaskScheduler.sol](../contracts/automation/TaskScheduler.sol)
- [deployments/live-automation-4201.json](../deployments/live-automation-4201.json)
- [frontend-next/src/components/vaults/SendPaymentModal.tsx](../frontend-next/src/components/vaults/SendPaymentModal.tsx)
- [frontend-next/src/app/(app)/activity/page.tsx](../frontend-next/src/app/(app)/activity/page.tsx)

## Recommended Framing

Frame this as a strong on-chain-first entry. If judges require two rails, present Stripe sandbox as immediate follow-up work rather than pretending it already exists.
