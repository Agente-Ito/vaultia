# Let the Agent Cook — Vaultia

Autonomy loop
- Goal intake → plan → policy check → execute → verify → receipt → reflect
- Escalation: if policy breach or uncertainty > threshold, request human approval.

Demo script
1) Provide a high-level goal with budget.
2) Agent plans sub-steps, runs a payment, logs minimal private context.
3) Emits a receipt; shows human-overrides when limits hit.

Evidence
- Planning/orchestration module
- Policy evaluation gating execution
- Receipts + verifications integrated into the loop
