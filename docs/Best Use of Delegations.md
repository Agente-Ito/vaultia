# Best Use of Delegations

## Submission Angle

This is one of Vaultia's strongest tracks. The product exists specifically to replace full wallet custody with least-privilege delegated execution.

## Why It Fits

- Universal Profile is part of the real execution model.
- LSP6 KeyManager is part of the real execution path, not a decorative integration.
- Manual and automated paths both rely on scoped permissions.
- Recipient, budget, cadence, and ownership constraints narrow authority further.

## Checklist Mapping

- Minimum necessary permissions: yes
- Expiration and limits: yes
- Controller-style delegated execution via KeyManager: yes
- Delegation visible in both architecture and UX: yes

## Demo Flow

1. Show vault deployment and ownership acceptance.
2. Show that direct unrestricted execution is not the model.
3. Show valid execution through KeyManager.
4. Show invalid execution blocked by policy or permission boundaries.

## Evidence

- [contracts/AgentSafe.sol](../contracts/AgentSafe.sol)
- [contracts/AgentVaultRegistry.sol](../contracts/AgentVaultRegistry.sol)
- [frontend-next/src/lib/web3/deployVault.ts](../frontend-next/src/lib/web3/deployVault.ts)
- [frontend-next/src/components/onboarding/SimpleSetupFlow.tsx](../frontend-next/src/components/onboarding/SimpleSetupFlow.tsx)
- [frontend-next/src/app/(app)/vaults/create/page.tsx](../frontend-next/src/app/(app)/vaults/create/page.tsx)
- [frontend-next/src/components/vaults/SendPaymentModal.tsx](../frontend-next/src/components/vaults/SendPaymentModal.tsx)

## Strongest Judge Message

Vaultia does not ask users to trust agents with custody. It lets users delegate exactly enough authority for execution, and nothing more.
