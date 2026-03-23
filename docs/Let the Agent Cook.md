# Let the Agent Cook

## Submission Angle

Vaultia lets the agent operate autonomously once the user defines the execution boundary. The system is explicitly designed so the user controls the policy envelope while the agent handles repeated execution inside it.

## Why It Fits

- Scheduler + keeper enable autonomous recurring work.
- The user does not have to manually approve every valid action.
- The agent can keep operating until it hits a boundary.
- If it exceeds scope, the protocol blocks execution rather than failing silently.

## Demo Flow

1. Configure a vault with constraints.
2. Create an automation task.
3. Show that the task can execute without the user online.
4. Show a successful keeper-driven payment in activity.
5. Show a blocked keeper attempt when a policy threshold is exceeded.

## Evidence

- [contracts/automation/TaskScheduler.sol](../contracts/automation/TaskScheduler.sol)
- [runner/keeper.js](../runner/keeper.js)
- [frontend-next/src/app/(app)/automation/page.tsx](../frontend-next/src/app/(app)/automation/page.tsx)
- [frontend-next/src/app/(app)/activity/page.tsx](../frontend-next/src/app/(app)/activity/page.tsx)
- [deployments/live-automation-4201.json](../deployments/live-automation-4201.json)

## Strongest Judge Message

The user does not micromanage the agent. The user defines the bounds, and the agent cooks inside them.

## Honest Caveat

- The current demo is strongest for bounded recurring execution, not fully open-ended multi-step agent planning.
