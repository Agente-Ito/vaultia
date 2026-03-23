# Agents with Receipt

## Submission Angle

Vaultia produces verifiable receipts through on-chain payment events, automation execution records, deployment artifacts, and the activity feed that aggregates those signals into one auditable view.

## Why It Fits

- Agent payments emit on-chain events.
- Automation outcomes are logged and surfaced in the UI.
- Activity now merges on-chain executions, manual blocked attempts, and keeper-driven outcomes.
- Verified runs and deployment artifacts give judges traceable proof.

## What Counts as the Receipt

In the current implementation, the receipt is event-based and trace-based:

- on-chain execution event
- transaction hash
- activity feed record
- deployment or automation artifact when relevant

## Demo Flow

1. Execute a valid payment.
2. Show the resulting on-chain transaction and activity row.
3. Trigger a blocked action.
4. Show the failure record in activity.
5. Show an automated execution and how it is labeled as keeper-driven.

## Evidence

- [contracts/AgentSafe.sol](../contracts/AgentSafe.sol)
- [frontend-next/src/app/(app)/activity/page.tsx](../frontend-next/src/app/(app)/activity/page.tsx)
- [frontend-next/src/lib/keeper-activity/server.ts](../frontend-next/src/lib/keeper-activity/server.ts)
- [frontend-next/src/app/api/verified-runs/route.ts](../frontend-next/src/app/api/verified-runs/route.ts)
- [deployments/live-stress-4201.json](../deployments/live-stress-4201.json)
- [deployments/live-automation-4201.json](../deployments/live-automation-4201.json)

## Honest Caveat

- These receipts are not yet standalone signed attestations.
- If judges accept verifiable on-chain events and auditable logs as receipts, Vaultia fits well.
