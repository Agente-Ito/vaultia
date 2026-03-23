# Open Track

## Submission Angle

Vaultia is a companion-agent execution layer for Universal Profiles. Instead of giving an AI agent full wallet access, the user gives it a constrained execution envelope: who it can pay, how much it can spend, how often it can act, and what permissions it can use.

This is a strong Open Track story because it is a complete product, not just a protocol primitive:

- vault creation UX
- policy configuration UX
- manual constrained payments
- autonomous automation flow
- activity and receipt visibility
- live testnet proof

## Why It Fits

- Clear user problem: agents should not hold unrestricted spending power.
- Clear user value: users can let agents operate without surrendering custody.
- Clear demo: valid actions succeed, invalid actions are blocked, automation continues autonomously.
- Strong UX surface in the frontend.

## Demo Flow

1. Create or select a vault.
2. Show recipient and budget constraints.
3. Execute one valid payment.
4. Attempt one invalid payment and show it blocked.
5. Create one automation task.
6. Show keeper-driven success and blocked activity in the feed.

## Evidence

- [README.md](../README.md)
- [frontend-next/src/app/page.tsx](../frontend-next/src/app/page.tsx)
- [frontend-next/src/app/(app)/vaults/page.tsx](../frontend-next/src/app/(app)/vaults/page.tsx)
- [frontend-next/src/app/(app)/automation/page.tsx](../frontend-next/src/app/(app)/automation/page.tsx)
- [frontend-next/src/app/(app)/activity/page.tsx](../frontend-next/src/app/(app)/activity/page.tsx)
- [STRESS_TEST_REPORT.md](../STRESS_TEST_REPORT.md)

## Strengths for Judges

- End-to-end narrative already exists.
- Product is understandable in one pass.
- Live testnet evidence is already documented.
- UX and protocol are aligned around one thesis.

## Honest Caveat

- The project is strongest when shown as a constrained execution product, not as a generalized autonomous agent platform.
