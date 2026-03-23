# Open Track — Vaultia

Goal: Show a compelling end-to-end agent experience on LUKSO with UP + KeyManager, payments on-chain, and verifiable receipts.

Demo beats (60–90s)
- User requests an action with cost (e.g., send 0.005 LYX to a recipient).
- Agent plans and enforces policy (limits, allowlist, expiry) and shows summary.
- Execute via UP → KeyManager with minimal permissions.
- Show transaction on explorer; emit receipt (signed attestation).
- Verify receipt in-app; show how to independently verify.

Judging checklist
- Clear UX and narrative (no manual hacks during demo)
- Real policy enforcement (not hard-coded happy path only)
- Transparent verification of what happened (tx + receipt)

How to run
- npm run demo:happy
- See scripts/demo-happy.md and receipts/README.md