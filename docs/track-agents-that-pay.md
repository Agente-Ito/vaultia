# Agents that Pay — Vaultia

How we meet the criteria
- On-chain LYX payments initiated by an agent through a Universal Profile (UP) using KeyManager permissions.
- Spend policies:
  - Per-tx and per-session limits (amount caps in wei)
  - Allowlist of recipients (addresses/UPs)
  - Expiry windows for delegated permissions
- Post-transaction checks: confirm receipt on-chain; generate/verifiable receipt artifact.

Demo steps
1) Agent receives a payment request (amount, recipient, reason).
2) Policy engine validates against caps and allowlist; may escalate if violated.
3) Execute via UP.execute -> KeyManager with minimal permissions.
4) Show tx hash and confirm status; generate signed receipt.

Configs to tweak
- policies/policy.example.json → maxAmountWei, allowedTargets, expirySec
- env vars for RPC, UP address, controller

Commands
- npm run demo:pay
- npm run verify:receipt ./receipts/out/<id>.json